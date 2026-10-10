#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * iOS side of the background alert checker (specs/NativeAlertScheduler.ts); the Android version is
 * android/app/src/main/java/com/floodshield/app/alerts/AlertWorker.kt.
 *
 * Plain Objective-C on purpose: AppDelegate.swift imports this header, and Swift can't import the
 * C++ that the React Native glue in FSAlertScheduler.mm needs.
 */
@interface FSAlertScheduler : NSObject

/// iOS requires background tasks to be registered before the app finishes launching, so call this
/// first thing in application(_:didFinishLaunchingWithOptions:).
+ (void)registerBackgroundTask;

@end

NS_ASSUME_NONNULL_END
