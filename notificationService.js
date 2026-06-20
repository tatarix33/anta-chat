// ANTA Chat - Push Bildirim Servisi
// Dosya Yolu: anta-chat/notificationService.js

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Uygulama açıkken (ön plandayken) bildirimin nasıl davranacağını belirler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Kullanıcıdan bildirim izni ister ve Expo Push Token üretir.
 * @returns {Promise<string|null>} Expo Push Token
 */
export async function registerForPushNotificationsAsync() {
  let token = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Varsayılan',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00FF00', // Neon Yeşil tema rengimiz
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Bildirim izni verilmedi!');
      return null;
    }

    // Expo projesinin kimliğini (Project ID) expo-constants ile alıyoruz.
    // Eğer EAS projeniz tanımlıysa burası otomatik dolacaktır.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    try {
      token = (await Notifications.getExpoPushTokenAsync({
        ...(projectId ? { projectId } : {}),
      })).data;
      console.log('Başarıyla oluşturulan Expo Push Token:', token);
    } catch (e) {
      console.log('Expo Push Token alınamadı:', e);
    }
  } else {
    console.log('Uyarı: Push bildirimleri için fiziksel bir cihaz kullanılmalıdır.');
  }

  return token;
}
