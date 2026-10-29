import type { ExpoConfig } from 'expo/config';

// Google Maps keys are only needed for development/production builds (Expo Go has its own).
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY;

const config: ExpoConfig = {
  name: 'Hunt',
  slug: 'hunt',
  scheme: 'hunt',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.jithinbthomas.hunt',
  },
  android: {
    package: 'com.jithinbthomas.hunt',
    adaptiveIcon: {
      backgroundColor: '#0E1116',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Hunt shares your location with the hunter on each ping while a game is running.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Hunt uses the camera to scan a hider’s catch code.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'react-native-maps',
      {
        ...(androidMapsKey ? { androidGoogleMapsApiKey: androidMapsKey } : {}),
        ...(iosMapsKey ? { iosGoogleMapsApiKey: iosMapsKey } : {}),
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
};

export default config;
