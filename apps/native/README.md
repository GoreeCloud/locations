# Native Locations privacy workspace

Flutter 3.27.4 / Dart 3.6.2. Native Linux desktop and Android targets, not WebView wrappers. From this directory: `flutter pub get`, `flutter analyze`, `flutter test`, `flutter build linux --release`, `flutter build apk --debug`. Android builds use a compatible JDK 17; no release signing is configured. Use synthetic data for development. No location or Internet permission is declared. Clipboard export requires confirmation; clipboard contents may be visible to other apps. No tracking, account synchronization, or server connectivity yet.
