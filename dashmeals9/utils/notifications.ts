import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export const requestNotificationPermission = async (): Promise<boolean> => {
    // Handling for Capacitor Android/iOS
    if (Capacitor.isNativePlatform()) {
        try {
            let perm = await PushNotifications.checkPermissions();
            if (perm.receive === 'prompt') {
                perm = await PushNotifications.requestPermissions();
            }
            return perm.receive === 'granted';
        } catch (e) {
            console.error("Error requesting Capacitor push permissions:", e);
            return false;
        }
    }

    // Web handling
    if (!('Notification' in window)) {
        console.warn("Ce navigateur ne supporte pas les notifications push.");
        return false;
    }
    
    // Check if we are in an iframe
    const isInIframe = window.self !== window.top;
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    if (Notification.permission === 'denied') {
        console.warn("Permission de notification déjà refusée.");
        return false;
    }
    
    try {
        // Some browsers block this in cross-origin iframes
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } catch (e) {
        console.error("Erreur lors de la demande de permission de notification", e);
        if (isInIframe) {
            console.warn("La demande de permission a probablement été bloquée par l'iframe.");
        }
        return false;
    }
};

export const sendPushNotification = (title: string, options?: any) => {
    // If native platform, we might rely on the native push service itself,
    // but for local UI feedback we can try to use local notifications or web api if it works
    
    if (!Capacitor.isNativePlatform()) {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        try {
            // Try to use Service Worker if available (better for mobile/Android)
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    (registration as any).showNotification(title, {
                        icon: '/logo.png', // Fallback icon
                        vibrate: [200, 100, 200],
                        ...options
                    });
                }).catch(() => {
                    new Notification(title, { icon: '/logo.png', ...options });
                });
            } else {
                new Notification(title, { icon: '/logo.png', ...options });
            }
        } catch (e) {
            new Notification(title, { icon: '/logo.png', ...options });
        }
    } else {
        // On native, we'd typically use a local notifications plugin for immediate local feedback
        // if not using a real push notification service.
        // For now, let's just log and rely on the permission check for the UI to be satisfied.
        console.log("Push Notification (Native):", title, options);
    }
};
