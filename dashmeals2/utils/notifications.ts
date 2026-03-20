export const requestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
        console.warn("Ce navigateur ne supporte pas les notifications push.");
        return false;
    }
    
    if (Notification.permission === 'granted') {
        return true;
    }
    
    try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } catch (e) {
        console.error("Erreur lors de la demande de permission de notification", e);
        return false;
    }
};

export const sendPushNotification = (title: string, options?: NotificationOptions) => {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
        try {
            // Try to use Service Worker if available (better for mobile/Android)
            navigator.serviceWorker.ready.then(registration => {
                (registration as any).showNotification(title, {
                    icon: '/logo.png', // Fallback icon
                    vibrate: [200, 100, 200],
                    ...options
                });
            }).catch(() => {
                // Fallback to standard Notification
                new Notification(title, {
                    icon: '/logo.png',
                    ...options
                });
            });
        } catch (e) {
            new Notification(title, {
                icon: '/logo.png',
                ...options
            });
        }
    }
};
