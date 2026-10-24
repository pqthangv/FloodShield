# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# MainActivity calls enableEdgeToEdge(). R8 copied androidx's EdgeToEdge.enable into onCreate and
# renamed the class (1.0.7: p50), so Play's scan found no call and warned that some users may not
# see the app edge-to-edge. Kept as it is, the call stays visible.
-keep class androidx.activity.EdgeToEdge { *; }
