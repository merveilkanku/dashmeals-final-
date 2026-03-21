import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export const pickImage = async (): Promise<{ blob: Blob, url: string } | null> => {
    try {
        const image = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Prompt // Ask user: Camera or Gallery
        });

        if (image.webPath) {
            const response = await fetch(image.webPath);
            const blob = await response.blob();
            return { blob, url: image.webPath };
        }
        return null;
    } catch (error) {
        console.error('Error picking image:', error);
        return null;
    }
};
