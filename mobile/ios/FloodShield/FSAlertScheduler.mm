#import "FSAlertScheduler.h"

#import <BackgroundTasks/BackgroundTasks.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#import <FloodShieldSpecs/FloodShieldSpecs.h>

// Keep equal to services/openMeteo.ts, AlertWorker.kt and backend/services/weather.py
// (backend/tests/test_app_sync.py checks).
static NSString *const FORECAST_URL = @"https://api.open-meteo.com/v1/forecast";
static NSString *const CURRENT_VARS =
    @"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,"
    @"weather_code,wind_speed_10m,wind_gusts_10m";
static NSString *const HOURLY_VARS =
    @"temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,"
    @"wind_gusts_10m";
static NSString *const DAILY_VARS =
    @"weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,"
    @"precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,"
    @"sunrise,sunset";
/// ~1 km (ward level), like the app (services/openMeteo.ts).
static const double SNAP_STEP = 0.01;
// Keep equal to services/glofas.ts, AlertWorker.kt and backend/services/flood.py (a test checks).
static NSString *const FLOOD_URL = @"https://flood-api.open-meteo.com/v1/flood";
static NSString *const FORECAST_VARS = @"river_discharge,river_discharge_p25,river_discharge_p75";
static const int PAST_DAYS = 3;
static const int FORECAST_DAYS = 16;

/// Must match BGTaskSchedulerPermittedIdentifiers in Info.plist, or iOS refuses to register it.
static NSString *const kTaskId = @"com.floodshield.app.alerts";
static NSString *const kUserAgent = @"FloodShield/1.0.5 (iOS app; https://github.com/pqthangv/FloodShield)";
/// iOS treats this as "not before": it decides when the check really runs.
static const NSTimeInterval kInterval = 30 * 60;
static const NSUInteger kMaxSeen = 300;

static NSString *const kKeyBaseUrl = @"fs_alerts_api_base_url";
static NSString *const kKeyLatitude = @"fs_alerts_latitude";
static NSString *const kKeyLongitude = @"fs_alerts_longitude";
static NSString *const kKeyEnabled = @"fs_alerts_enabled";
static NSString *const kKeyLanguage = @"fs_alerts_language";
static NSString *const kKeySeen = @"fs_alerts_seen_ids";
static NSString *const kKeyRiver = @"fs_alerts_river";
// Rain-warning pushes (backend/routers/PushRoute.py), as PushRegistration.kt does on Android.
static NSString *const kKeyDeviceId = @"fs_alerts_device_id";
static NSString *const kKeyPushToken = @"fs_alerts_push_token";
static NSString *const kKeyPushRegistered = @"fs_alerts_push_registered";
static NSString *const kKeyPushRegisteredAt = @"fs_alerts_push_registered_at";
/// The server forgets phones that don't check in for 60 days; refresh once a day.
static const NSTimeInterval kPushRefresh = 24 * 60 * 60;

// The home-screen widget (FloodShieldWidget/), which reads what is saved in this App Group.
static NSString *const kWidgetGroup = @"group.com.floodshield.app";
static NSString *const kWidgetSnapshot = @"fs_widget_snapshot";
static NSString *const kWidgetLanguage = @"fs_widget_language";
static NSString *const kWidgetTest = @"fs_widget_test";
// What the widget needs to refresh itself (WidgetFetch.swift reads the same keys).
static NSString *const kWidgetApiBase = @"fs_widget_api_base";
static NSString *const kWidgetLatitude = @"fs_widget_latitude";
static NSString *const kWidgetLongitude = @"fs_widget_longitude";
static NSString *const kWidgetAlertsOn = @"fs_widget_alerts_on";
static NSString *const kWidgetRiver = @"fs_widget_river";
/// The widget notes when it last drew (WidgetModel.swift); recently means it's on the home screen.
static NSString *const kWidgetShownAt = @"fs_widget_seen_at";
static const NSTimeInterval kWidgetActive = 24 * 60 * 60;

/// WidgetReload.swift: WidgetKit can only be used from Swift.
extern "C" void FSReloadWidgets(void);

static double Snap(double value)
{
  return round(round(value / SNAP_STEP) * SNAP_STEP * 10000) / 10000;
}

static NSString *StringOrEmpty(id value)
{
  return [value isKindOfClass:NSString.class] ? value : @"";
}

static NSString *_Nullable StringOrNil(id value)
{
  return [value isKindOfClass:NSString.class] && [(NSString *)value length] > 0 ? value : nil;
}

/// The widget snapshot's weather values, which come as a whole (as in WidgetStore.kt).
static NSArray<NSString *> *WidgetWeatherKeys(void)
{
  return @[ @"temperature", @"condition", @"icon", @"is_day", @"wind_speed", @"apparent_temperature", @"humidity" ];
}

typedef void (^FSResponse)(NSInteger status, NSData *_Nullable body);

@interface FSAlertScheduler ()
+ (void)rememberSeen:(NSArray *)ids;
@end

/// iOS hides notifications while the app is open unless told otherwise. Show them like Android
/// does (this is also what makes Settings > "Check now" visibly work).
@interface FSNotificationPresenter : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation FSNotificationPresenter

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler
{
  [FSNotificationPresenter rememberShown:notification];
  completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList |
                    UNNotificationPresentationOptionSound);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    didReceiveNotificationResponse:(UNNotificationResponse *)response
             withCompletionHandler:(void (^)(void))completionHandler
{
  // Tapping the notification just opens the app, which shows the alert.
  [FSNotificationPresenter rememberShown:response.notification];
  completionHandler();
}

/// A pushed warning (its id in "id") the user has seen: the background check won't repeat it.
+ (void)rememberShown:(UNNotification *)notification
{
  id alertId = notification.request.content.userInfo[@"id"];
  if ([alertId isKindOfClass:NSString.class]) {
    [FSAlertScheduler rememberSeen:@[ alertId ]];
  }
}

@end

@interface FSAlertScheduler () <NativeAlertSchedulerSpec>
@end

@implementation FSAlertScheduler

+ (NSString *)moduleName
{
  return @"AlertScheduler";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAlertSchedulerSpecJSI>(params);
}

#pragma mark - JS methods (specs/NativeAlertScheduler.ts)

- (void)configure:(NSString *)apiBaseUrl
         latitude:(double)latitude
        longitude:(double)longitude
          enabled:(BOOL)enabled
         language:(NSString *)language
         deviceId:(NSString *)deviceId
{
  NSString *base = apiBaseUrl;
  while ([base hasSuffix:@"/"]) {
    base = [base substringToIndex:base.length - 1];
  }
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults setObject:base forKey:kKeyBaseUrl];
  [defaults setDouble:latitude forKey:kKeyLatitude];
  [defaults setDouble:longitude forKey:kKeyLongitude];
  [defaults setBool:enabled forKey:kKeyEnabled];
  [defaults setObject:language forKey:kKeyLanguage];
  [defaults setObject:deviceId forKey:kKeyDeviceId];
  NSUserDefaults *widget = [FSAlertScheduler widgetDefaults];
  // The widget's own texts follow the language chosen in the app.
  [widget setObject:language forKey:kWidgetLanguage];
  // The widget refreshes itself too (WidgetFetch.swift): where, from which server, whether at all.
  [widget setObject:base forKey:kWidgetApiBase];
  [widget setDouble:latitude forKey:kWidgetLatitude];
  [widget setDouble:longitude forKey:kWidgetLongitude];
  [widget setBool:enabled forKey:kWidgetAlertsOn];
  FSReloadWidgets();

  if (!enabled) {
    [BGTaskScheduler.sharedScheduler cancelTaskRequestWithIdentifier:kTaskId];
    // No more rain-warning pushes for this phone.
    [FSAlertScheduler syncPushRegistration];
    return;
  }
  // iOS asks the user only once and then remembers the answer; calling this again is harmless.
  [UNUserNotificationCenter.currentNotificationCenter
      requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound |
                                       UNAuthorizationOptionBadge)
                    completionHandler:^(BOOL granted, NSError *_Nullable error) {
                      if (granted) {
                        // The token comes back in didRegisterForPushWithDeviceToken.
                        dispatch_async(dispatch_get_main_queue(), ^{
                          [UIApplication.sharedApplication registerForRemoteNotifications];
                        });
                      }
                    }];
  [FSAlertScheduler scheduleNextCheck];
  // A new place or language goes to the server with the token iOS already gave.
  [FSAlertScheduler syncPushRegistration];
}

- (void)setRiver:(NSString *)river
{
  [NSUserDefaults.standardUserDefaults setObject:river forKey:kKeyRiver];
  // The widget sends it too when it refreshes itself.
  [[FSAlertScheduler widgetDefaults] setObject:river forKey:kWidgetRiver];
}

/// The hidden widget test (Settings > Version, long press), kept for the iPhone widget.
- (void)setWidgetTest:(BOOL)on
{
  [[FSAlertScheduler widgetDefaults] setBool:on forKey:kWidgetTest];
  FSReloadWidgets();
}

/// What the home-screen widget shows, from the app (services/widget.ts).
- (void)setWidget:(NSString *)snapshot
{
  [FSAlertScheduler saveWidgetFromApp:snapshot];
}

- (void)markSeen:(NSArray *)ids
{
  [FSAlertScheduler rememberSeen:ids];
}

- (void)checkNow
{
  [FSAlertScheduler runCheckWithCompletion:^(BOOL success){
  }
                          onExpiration:nil];
}

#pragma mark - Background task

+ (void)registerBackgroundTask
{
  // The notification center only keeps a weak reference to its delegate: keep it alive here.
  static FSNotificationPresenter *presenter;
  presenter = [FSNotificationPresenter new];
  UNUserNotificationCenter.currentNotificationCenter.delegate = presenter;

  [BGTaskScheduler.sharedScheduler registerForTaskWithIdentifier:kTaskId
                                                      usingQueue:nil
                                                   launchHandler:^(__kindof BGTask *task) {
                                                     [self handleBackgroundTask:task];
                                                   }];
}

+ (void)scheduleNextCheck
{
  BGAppRefreshTaskRequest *request = [[BGAppRefreshTaskRequest alloc] initWithIdentifier:kTaskId];
  request.earliestBeginDate = [NSDate dateWithTimeIntervalSinceNow:kInterval];
  NSError *error = nil;
  // Fails on the simulator and when Background App Refresh is off; the app still checks on open.
  if (![BGTaskScheduler.sharedScheduler submitTaskRequest:request error:&error]) {
    NSLog(@"FloodShield: alert check not scheduled: %@", error);
  }
}

+ (void)handleBackgroundTask:(BGTask *)task
{
  // Schedule the next check first: iOS never repeats a refresh task by itself.
  [self scheduleNextCheck];
  // Keeps this phone known to the server for rain-warning pushes, even if the app isn't opened.
  [self syncPushRegistration];
  __block void (^cancel)(void) = nil;
  task.expirationHandler = ^{
    // iOS gives a background task about 30 seconds; stop the network requests if time runs out.
    if (cancel) {
      cancel();
    }
  };
  [self runCheckWithCompletion:^(BOOL success) {
    [task setTaskCompletedWithSuccess:success];
  }
                  onExpiration:^(void (^cancelRequests)(void)) {
                    cancel = [cancelRequests copy];
                  }];
}

#pragma mark - Rain-warning pushes (same steps as PushRegistration.kt)

+ (void)didRegisterForPushWithDeviceToken:(NSData *)deviceToken
{
  const unsigned char *bytes = (const unsigned char *)deviceToken.bytes;
  NSMutableString *token = [NSMutableString stringWithCapacity:deviceToken.length * 2];
  for (NSUInteger i = 0; i < deviceToken.length; i++) {
    [token appendFormat:@"%02x", bytes[i]];
  }
  [NSUserDefaults.standardUserDefaults setObject:token forKey:kKeyPushToken];
  [self syncPushRegistration];
}

/// Registers this phone with the server (PUT /push) when something changed or once a day, or
/// removes the registration (DELETE /push) when alerts were turned off.
+ (void)syncPushRegistration
{
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSString *base = [defaults stringForKey:kKeyBaseUrl];
  NSString *deviceId = [defaults stringForKey:kKeyDeviceId];
  if (base.length == 0 || deviceId.length == 0) {
    return;
  }
  NSString *token = [defaults stringForKey:kKeyPushToken];
  NSString *language = [defaults stringForKey:kKeyLanguage] ?: @"vi";
  BOOL hasPlace = [defaults objectForKey:kKeyLatitude] && [defaults objectForKey:kKeyLongitude];
  NSMutableURLRequest *request =
      [NSMutableURLRequest requestWithURL:[NSURL URLWithString:[base stringByAppendingString:@"/push"]]];
  request.timeoutInterval = 30;
  [request setValue:kUserAgent forHTTPHeaderField:@"User-Agent"];
  [request setValue:deviceId forHTTPHeaderField:@"X-Device-Id"];
  // Warnings are written in the language chosen in the app.
  [request setValue:language forHTTPHeaderField:@"Accept-Language"];

  if (![defaults boolForKey:kKeyEnabled] || token.length == 0 || !hasPlace) {
    if (![defaults stringForKey:kKeyPushRegistered]) {
      return;
    }
    request.HTTPMethod = @"DELETE";
    [self send:request
        session:NSURLSession.sharedSession
           then:^(NSInteger status, NSData *body) {
             if (status >= 200 && status < 500) {
               [defaults removeObjectForKey:kKeyPushRegistered];
             }
           }];
    return;
  }
  double latitude = [defaults doubleForKey:kKeyLatitude];
  double longitude = [defaults doubleForKey:kKeyLongitude];
  // The server rounds to the same ~10 km area, so moving inside it changes nothing.
  NSString *registration =
      [NSString stringWithFormat:@"%@|%@|%ld|%ld|%@", base, token, lround(latitude * 10),
                                 lround(longitude * 10), language];
  NSTimeInterval now = NSDate.date.timeIntervalSince1970;
  if ([registration isEqualToString:[defaults stringForKey:kKeyPushRegistered]] &&
      now - [defaults doubleForKey:kKeyPushRegisteredAt] < kPushRefresh) {
    return;
  }
  request.HTTPMethod = @"PUT";
  request.HTTPBody = [NSJSONSerialization dataWithJSONObject:@{
    @"token" : token,
    @"platform" : @"ios",
    @"latitude" : @(latitude),
    @"longitude" : @(longitude)
  }
                                                     options:0
                                                       error:nil];
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  [self send:request
      session:NSURLSession.sharedSession
         then:^(NSInteger status, NSData *body) {
           // Other answers (an older server without push, a refused value) are tried again later.
           if (status >= 200 && status < 300) {
             [defaults setObject:registration forKey:kKeyPushRegistered];
             [defaults setDouble:now forKey:kKeyPushRegisteredAt];
           }
         }];
}

#pragma mark - The check (same steps as AlertWorker.kt)

+ (void)runCheckWithCompletion:(void (^)(BOOL success))completion
                  onExpiration:(nullable void (^)(void (^cancelRequests)(void)))onExpiration
{
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSString *base = [defaults stringForKey:kKeyBaseUrl];
  if (![defaults boolForKey:kKeyEnabled] || base.length == 0) {
    completion(YES);
    return;
  }
  double latitude = [defaults doubleForKey:kKeyLatitude];
  double longitude = [defaults doubleForKey:kKeyLongitude];
  NSString *language = [defaults stringForKey:kKeyLanguage] ?: @"vi";

  NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
  // Free hosting plans can take ~1 minute to wake up.
  config.timeoutIntervalForRequest = 60;
  config.HTTPAdditionalHeaders = @{@"User-Agent" : kUserAgent, @"Accept" : @"application/json"};
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config];
  // When iOS ends the background time, the session is cancelled. A cancelled session throws if it
  // is asked to start another request, so nothing new starts after that, and we finish only once.
  __block BOOL cancelled = NO;
  __block BOOL finished = NO;
  if (onExpiration) {
    onExpiration(^{
      cancelled = YES;
      [session invalidateAndCancel];
    });
  }
  void (^finish)(BOOL) = ^(BOOL success) {
    if (finished) {
      return;
    }
    finished = YES;
    if (!cancelled) {
      [session finishTasksAndInvalidate];
    }
    completion(success);
  };

  // 1. The phone downloads the forecast with its own internet address (see services/openMeteo.ts).
  NSString *forecastUrl = [NSString
      stringWithFormat:@"%@?latitude=%.4f&longitude=%.4f&current=%@&hourly=%@&daily=%@"
                       @"&timezone=auto&forecast_days=7&wind_speed_unit=kmh",
                       FORECAST_URL, Snap(latitude), Snap(longitude), CURRENT_VARS, HOURLY_VARS,
                       DAILY_VARS];
  NSMutableURLRequest *forecastRequest =
      [NSMutableURLRequest requestWithURL:[NSURL URLWithString:forecastUrl]];
  forecastRequest.timeoutInterval = 20;

  NSString *getUrl =
      [NSString stringWithFormat:@"%@/alerts?lat=%f&lon=%f", base, latitude, longitude];
  void (^serverFetches)(void) = ^{
    if (cancelled) {
      finish(NO);
      return;
    }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:getUrl]];
    [request setValue:language forHTTPHeaderField:@"Accept-Language"];
    [self send:request
        session:session
           then:^(NSInteger status, NSData *body) {
             finish([self handleAlertsResponse:status body:body]);
           }];
  };

  [self send:forecastRequest
      session:session
         then:^(NSInteger status, NSData *body) {
           id forecast = (status >= 200 && status < 300 && body)
               ? [NSJSONSerialization JSONObjectWithData:body options:0 error:nil]
               : nil;
           if (![forecast isKindOfClass:NSDictionary.class]) {
             serverFetches();
             return;
           }
           if (cancelled) {
             finish(NO);
             return;
           }
           // 2. The river the app found here, with its forecast (see services/glofas.ts).
           [self riverNearLatitude:latitude
                         longitude:longitude
                           session:session
                              then:^(NSDictionary *_Nullable river) {
                                if (cancelled) {
                                  finish(NO);
                                  return;
                                }
                                // 3. The server turns them into alerts (POST /alerts).
                                NSMutableDictionary *payload = [@{
                                  @"latitude" : @(latitude),
                                  @"longitude" : @(longitude),
                                  @"forecast" : forecast
                                } mutableCopy];
                                if (river) {
                                  payload[@"flood"] = river;
                                }
                                NSMutableURLRequest *post = [NSMutableURLRequest
                                    requestWithURL:[NSURL URLWithString:[base stringByAppendingString:@"/alerts"]]];
                                post.HTTPMethod = @"POST";
                                post.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload
                                                                                options:0
                                                                                  error:nil];
                                [post setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
                                [post setValue:language forHTTPHeaderField:@"Accept-Language"];
                                [self send:post
                                    session:session
                                       then:^(NSInteger postStatus, NSData *postBody) {
                                         // An older server without the POST route, or rejected
                                         // data: let it fetch.
                                         if (postStatus == 404 || postStatus == 405 || postStatus == 422) {
                                           serverFetches();
                                           return;
                                         }
                                         BOOL ok = [self handleAlertsResponse:postStatus body:postBody];
                                         // The widget, when there is one: the weather now, from the
                                         // same forecast (one more request, so only then).
                                         if (ok && !cancelled && [self widgetIsShown]) {
                                           [self fetchWidgetWeather:forecast
                                                           latitude:latitude
                                                          longitude:longitude
                                                               base:base
                                                           language:language
                                                            session:session
                                                               then:^{
                                                                 finish(ok);
                                                               }];
                                         } else {
                                           finish(ok);
                                         }
                                       }];
                              }];
         }];
}

/// The river the app found near this place (setRiver) with its forecast downloaded now, as
/// POST /alerts takes it; nil when there is none for this place or the download failed.
+ (void)riverNearLatitude:(double)latitude
                longitude:(double)longitude
                  session:(NSURLSession *)session
                     then:(void (^)(NSDictionary *_Nullable river))then
{
  NSData *saved = [[NSUserDefaults.standardUserDefaults stringForKey:kKeyRiver]
      dataUsingEncoding:NSUTF8StringEncoding];
  id river = saved ? [NSJSONSerialization JSONObjectWithData:saved options:0 error:nil] : nil;
  // Only for the place it was found for: the user may have moved since.
  if (![river isKindOfClass:NSDictionary.class] ||
      ![river[@"latitude"] isKindOfClass:NSNumber.class] ||
      ![river[@"longitude"] isKindOfClass:NSNumber.class] ||
      fabs([river[@"latitude"] doubleValue] - latitude) >= 0.05 ||
      fabs([river[@"longitude"] doubleValue] - longitude) >= 0.05) {
    then(nil);
    return;
  }
  id cell = river[@"cell"];
  if (cell == NSNull.null) {
    then(@{@"cell" : NSNull.null}); // no river nearby
    return;
  }
  if (![cell isKindOfClass:NSDictionary.class] ||
      ![cell[@"latitude"] isKindOfClass:NSNumber.class] ||
      ![cell[@"longitude"] isKindOfClass:NSNumber.class]) {
    then(nil);
    return;
  }
  NSString *url = [NSString
      stringWithFormat:@"%@?latitude=%@&longitude=%@&daily=%@&past_days=%d&forecast_days=%d",
                       FLOOD_URL, cell[@"latitude"], cell[@"longitude"], FORECAST_VARS, PAST_DAYS,
                       FORECAST_DAYS];
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
  request.timeoutInterval = 20;
  id maxima = [river[@"annual_maxima"] isKindOfClass:NSArray.class] ? river[@"annual_maxima"] : @[];
  [self send:request
      session:session
         then:^(NSInteger status, NSData *body) {
           id json = (status >= 200 && status < 300 && body)
               ? [NSJSONSerialization JSONObjectWithData:body options:0 error:nil]
               : nil;
           id daily = [json isKindOfClass:NSDictionary.class] ? json[@"daily"] : nil;
           then([daily isKindOfClass:NSDictionary.class]
                    ? @{@"cell" : cell, @"forecast" : daily, @"annual_maxima" : maxima}
                    : nil);
         }];
}

/// status 0 means no answer (offline, timeout, cancelled).
+ (void)send:(NSURLRequest *)request session:(NSURLSession *)session then:(FSResponse)then
{
  NSURLSessionDataTask *task = [session
      dataTaskWithRequest:request
        completionHandler:^(NSData *_Nullable data, NSURLResponse *_Nullable response,
                            NSError *_Nullable error) {
          NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class]
              ? ((NSHTTPURLResponse *)response).statusCode
              : 0;
          then(error ? 0 : status, data);
        }];
  [task resume];
}

/// Notifies new alerts; NO when the server didn't answer properly (iOS then tries again later).
+ (BOOL)handleAlertsResponse:(NSInteger)status body:(nullable NSData *)body
{
  if (status < 200 || status >= 300 || !body) {
    return NO;
  }
  id json = [NSJSONSerialization JSONObjectWithData:body options:0 error:nil];
  NSArray *alerts = [json isKindOfClass:NSDictionary.class] ? json[@"alerts"] : nil;
  if (![alerts isKindOfClass:NSArray.class]) {
    return NO;
  }
  [self saveWidgetAlerts:alerts];
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSMutableOrderedSet *seen =
      [NSMutableOrderedSet orderedSetWithArray:[defaults stringArrayForKey:kKeySeen] ?: @[]];
  NSSet *notifySeverities = [NSSet setWithArray:@[ @"moderate", @"high", @"severe" ]];

  for (NSDictionary *alert in alerts) {
    if (![alert isKindOfClass:NSDictionary.class]) {
      continue;
    }
    NSString *alertId = StringOrEmpty(alert[@"id"]);
    if (alertId.length == 0 || [seen containsObject:alertId] ||
        ![notifySeverities containsObject:StringOrEmpty(alert[@"severity"])]) {
      continue;
    }
    NSString *area = StringOrEmpty(alert[@"area"]);
    NSString *description = StringOrEmpty(alert[@"description"]);
    UNMutableNotificationContent *content = [UNMutableNotificationContent new];
    content.title = StringOrEmpty(alert[@"title"]);
    content.body =
        description.length ? [NSString stringWithFormat:@"%@\n%@", area, description] : area;
    content.sound = UNNotificationSound.defaultSound;
    content.userInfo = @{@"alertId" : alertId};
    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:alertId
                                                                          content:content
                                                                          trigger:nil];
    [UNUserNotificationCenter.currentNotificationCenter addNotificationRequest:request
                                                         withCompletionHandler:nil];
    [seen addObject:alertId];
  }
  [self saveSeen:seen];
  return YES;
}

+ (void)rememberSeen:(NSArray *)ids
{
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSMutableOrderedSet *seen =
      [NSMutableOrderedSet orderedSetWithArray:[defaults stringArrayForKey:kKeySeen] ?: @[]];
  for (id alertId in ids) {
    if ([alertId isKindOfClass:NSString.class]) {
      [seen addObject:alertId];
    }
  }
  [self saveSeen:seen];
}

#pragma mark - Home-screen widget (same steps as widget/WidgetStore.kt on Android)

+ (NSUserDefaults *)widgetDefaults
{
  return [[NSUserDefaults alloc] initWithSuiteName:kWidgetGroup];
}

+ (nullable NSMutableDictionary *)loadWidgetSnapshot
{
  NSData *data = [[[self widgetDefaults] stringForKey:kWidgetSnapshot] dataUsingEncoding:NSUTF8StringEncoding];
  id json = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  return [json isKindOfClass:NSDictionary.class] ? [json mutableCopy] : nil;
}

/// Saves the snapshot as JSON (what WidgetModel.swift reads) and redraws the widget.
+ (void)saveWidgetSnapshot:(NSDictionary *)snapshot
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:snapshot options:0 error:nil];
  if (!data) {
    return;
  }
  [[self widgetDefaults] setObject:[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]
                            forKey:kWidgetSnapshot];
  FSReloadWidgets();
}

/// From the app: what it shows now. A part it couldn't load (null) keeps the saved one, except the
/// alerts of another place.
+ (void)saveWidgetFromApp:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  id update = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  if (![update isKindOfClass:NSDictionary.class]) {
    return;
  }
  NSDictionary *old = [self loadWidgetSnapshot];
  NSString *oldPlace = StringOrNil(old[@"place"]);
  NSString *newPlace = StringOrNil(update[@"place"]);
  BOOL samePlace = !oldPlace || !newPlace || [oldPlace isEqualToString:newPlace];
  NSMutableDictionary *snapshot = [NSMutableDictionary new];
  if (newPlace ?: oldPlace) {
    snapshot[@"place"] = newPlace ?: oldPlace;
  }
  // The weather comes as a whole: without a temperature, nothing of it loaded.
  NSDictionary *weather = ([update[@"temperature"] isKindOfClass:NSNumber.class] || !old) ? update : old;
  for (NSString *key in WidgetWeatherKeys()) {
    id value = weather[key];
    if (value && value != NSNull.null) {
      snapshot[key] = value;
    }
  }
  id checkedAt = update[@"checked_at"];
  if ([update[@"alerts"] isKindOfClass:NSArray.class]) {
    snapshot[@"alerts"] = update[@"alerts"];
    snapshot[@"checked_at"] = [checkedAt isKindOfClass:NSNumber.class] ? checkedAt : @0;
  } else if (samePlace && [old[@"alerts"] isKindOfClass:NSArray.class]) {
    snapshot[@"alerts"] = old[@"alerts"];
    snapshot[@"checked_at"] = [old[@"checked_at"] isKindOfClass:NSNumber.class] ? old[@"checked_at"] : @0;
  } else {
    snapshot[@"checked_at"] = @0;
  }
  [self saveWidgetSnapshot:snapshot];
}

/// From the background check: the alerts it just got, now.
+ (void)saveWidgetAlerts:(NSArray *)alerts
{
  NSMutableDictionary *snapshot = [self loadWidgetSnapshot] ?: [NSMutableDictionary new];
  NSMutableArray *list = [NSMutableArray new];
  for (id alert in alerts) {
    if ([alert isKindOfClass:NSDictionary.class]) {
      [list addObject:@{
        @"title" : StringOrEmpty(alert[@"title"]),
        @"severity" : StringOrEmpty(alert[@"severity"])
      }];
    }
  }
  snapshot[@"alerts"] = list;
  snapshot[@"checked_at"] = @(floor(NSDate.date.timeIntervalSince1970 * 1000));
  [self saveWidgetSnapshot:snapshot];
}

/// From the background check: POST /weather's answer (the weather now and the place name).
+ (void)saveWidgetWeather:(NSDictionary *)weather
{
  NSDictionary *current = weather[@"current"];
  if (![current isKindOfClass:NSDictionary.class]) {
    return;
  }
  NSMutableDictionary *snapshot = [self loadWidgetSnapshot] ?: [NSMutableDictionary new];
  // The app's label (a city the user picked, in their language) wins over the server's.
  NSDictionary *location = weather[@"location"];
  if (!StringOrNil(snapshot[@"place"]) && [location isKindOfClass:NSDictionary.class] &&
      StringOrNil(location[@"name"])) {
    snapshot[@"place"] = location[@"name"];
  }
  for (NSString *key in WidgetWeatherKeys()) {
    id value = current[key];
    if (value && value != NSNull.null) {
      snapshot[key] = value;
    }
  }
  // The widget's short words (servers before 1.0.5 only send the long ones), as in WidgetStore.kt.
  NSString *shortWords = StringOrNil(current[@"condition_short"]);
  if (shortWords) {
    snapshot[@"condition"] = shortWords;
  }
  [self saveWidgetSnapshot:snapshot];
}

/// Whether a widget drew lately, i.e. one is on the home screen.
+ (BOOL)widgetIsShown
{
  double shownAt = [[self widgetDefaults] doubleForKey:kWidgetShownAt];
  return shownAt > 0 && NSDate.date.timeIntervalSince1970 - shownAt < kWidgetActive;
}

/// The weather for the widget (POST /weather, from the forecast just downloaded); then() always.
+ (void)fetchWidgetWeather:(NSDictionary *)forecast
                  latitude:(double)latitude
                 longitude:(double)longitude
                      base:(NSString *)base
                  language:(NSString *)language
                   session:(NSURLSession *)session
                      then:(void (^)(void))then
{
  NSMutableURLRequest *post =
      [NSMutableURLRequest requestWithURL:[NSURL URLWithString:[base stringByAppendingString:@"/weather"]]];
  post.HTTPMethod = @"POST";
  post.HTTPBody = [NSJSONSerialization
      dataWithJSONObject:@{@"latitude" : @(latitude), @"longitude" : @(longitude), @"forecast" : forecast}
                 options:0
                   error:nil];
  [post setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  [post setValue:language forHTTPHeaderField:@"Accept-Language"];
  [self send:post
      session:session
         then:^(NSInteger status, NSData *body) {
           id json = (status >= 200 && status < 300 && body)
               ? [NSJSONSerialization JSONObjectWithData:body options:0 error:nil]
               : nil;
           if ([json isKindOfClass:NSDictionary.class]) {
             [self saveWidgetWeather:json];
           }
           then();
         }];
}

/// Keeps the most recent ids, so the list can't grow forever.
+ (void)saveSeen:(NSOrderedSet *)seen
{
  NSArray *ids = seen.array;
  if (ids.count > kMaxSeen) {
    ids = [ids subarrayWithRange:NSMakeRange(ids.count - kMaxSeen, kMaxSeen)];
  }
  [NSUserDefaults.standardUserDefaults setObject:ids forKey:kKeySeen];
}

@end
