#import "FSAlertScheduler.h"

#import <BackgroundTasks/BackgroundTasks.h>
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

/// Must match BGTaskSchedulerPermittedIdentifiers in Info.plist, or iOS refuses to register it.
static NSString *const kTaskId = @"com.floodshield.app.alerts";
static NSString *const kUserAgent = @"FloodShield/1.0 (iOS app; https://github.com/pqthangv/FloodShield)";
/// iOS treats this as "not before": it decides when the check really runs.
static const NSTimeInterval kInterval = 30 * 60;
static const NSUInteger kMaxSeen = 300;

static NSString *const kKeyBaseUrl = @"fs_alerts_api_base_url";
static NSString *const kKeyLatitude = @"fs_alerts_latitude";
static NSString *const kKeyLongitude = @"fs_alerts_longitude";
static NSString *const kKeyEnabled = @"fs_alerts_enabled";
static NSString *const kKeyLanguage = @"fs_alerts_language";
static NSString *const kKeySeen = @"fs_alerts_seen_ids";

static double Snap(double value)
{
  return round(round(value / SNAP_STEP) * SNAP_STEP * 10000) / 10000;
}

static NSString *StringOrEmpty(id value)
{
  return [value isKindOfClass:NSString.class] ? value : @"";
}

typedef void (^FSResponse)(NSInteger status, NSData *_Nullable body);

/// iOS hides notifications while the app is open unless told otherwise. Show them like Android
/// does (this is also what makes Settings > "Check now" visibly work).
@interface FSNotificationPresenter : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation FSNotificationPresenter

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler
{
  completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList |
                    UNNotificationPresentationOptionSound);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    didReceiveNotificationResponse:(UNNotificationResponse *)response
             withCompletionHandler:(void (^)(void))completionHandler
{
  // Tapping the notification just opens the app, which shows the alert.
  completionHandler();
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

  if (!enabled) {
    [BGTaskScheduler.sharedScheduler cancelTaskRequestWithIdentifier:kTaskId];
    return;
  }
  // iOS asks the user only once and then remembers the answer; calling this again is harmless.
  [UNUserNotificationCenter.currentNotificationCenter
      requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound |
                                       UNAuthorizationOptionBadge)
                    completionHandler:^(BOOL granted, NSError *_Nullable error){
                    }];
  [FSAlertScheduler scheduleNextCheck];
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
           // 2. The server turns it into alerts (POST /alerts).
           NSDictionary *payload =
               @{@"latitude" : @(latitude), @"longitude" : @(longitude), @"forecast" : forecast};
           NSMutableURLRequest *post = [NSMutableURLRequest
               requestWithURL:[NSURL URLWithString:[base stringByAppendingString:@"/alerts"]]];
           post.HTTPMethod = @"POST";
           post.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
           [post setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
           [post setValue:language forHTTPHeaderField:@"Accept-Language"];
           [self send:post
               session:session
                  then:^(NSInteger postStatus, NSData *postBody) {
                    // An older server without the POST route, or a rejected forecast: let it fetch.
                    if (postStatus == 404 || postStatus == 405 || postStatus == 422) {
                      serverFetches();
                    } else {
                      finish([self handleAlertsResponse:postStatus body:postBody]);
                    }
                  }];
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
