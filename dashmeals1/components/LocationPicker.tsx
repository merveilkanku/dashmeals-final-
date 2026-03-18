import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Crosshair, Loader } from 'lucide-react';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Location {
  lat: number;
  lng: number;
  address?: string;
}

interface Props {
  onLocationSelect: (location: Location) => void;
  initialLocation?: Location;
}

const fetchAddress = async (lat: number, lng: number): Promise<string> => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return data.display_name || 'Position sélectionnée sur la carte';
  } catch (error) {
    console.error("Reverse geocoding failed", error);
    return 'Position sélectionnée sur la carte';
  }
};

const LocationMarker = ({ position, setPosition, onLocationSelect }: { position: Location | null, setPosition: (pos: Location) => void, onLocationSelect: (pos: Location) => void }) => {
  const map = useMapEvents({
    async click(e) {
      const newPos = { lat: e.latlng.lat, lng: e.latlng.lng };
      setPosition(newPos);
      const address = await fetchAddress(newPos.lat, newPos.lng);
      onLocationSelect({ ...newPos, address });
    },
  });

  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], map.getZoom());
    }
  }, [position, map]);

  return position === null ? null : (
    <Marker position={[position.lat, position.lng]} />
  );
};

export const LocationPicker: React.FC<Props> = ({ onLocationSelect, initialLocation }) => {
  const [position, setPosition] = useState<Location | null>(initialLocation || null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to Kinshasa if no initial location
  const defaultCenter: [number, number] = [-4.4419, 15.2663];

  const locateUser = () => {
    setIsLocating(true);
    setError(null);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(newPos);
          const address = await fetchAddress(newPos.lat, newPos.lng);
          onLocationSelect({ ...newPos, address });
          setIsLocating(false);
        },
        (err) => {
          console.error("Geolocation error:", err);
          setError("Impossible d'obtenir votre position. Veuillez cliquer sur la carte.");
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setError("La géolocalisation n'est pas supportée par votre navigateur.");
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (!initialLocation) {
      locateUser();
    }
  }, []);

  return (
    <div className="relative w-full h-64 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <MapContainer 
        center={position ? [position.lat, position.lng] : defaultCenter} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} setPosition={setPosition} onLocationSelect={onLocationSelect} />
      </MapContainer>

      {/* Locate Me Button */}
      <button
        type="button"
        onClick={locateUser}
        className="absolute bottom-4 right-4 z-[400] bg-white p-3 rounded-full shadow-md hover:bg-gray-50 transition-colors"
        title="Ma position actuelle"
      >
        {isLocating ? <Loader size={20} className="animate-spin text-brand-600" /> : <Crosshair size={20} className="text-gray-700" />}
      </button>

      {/* Overlay Message */}
      {!position && !isLocating && (
        <div className="absolute inset-0 z-[400] pointer-events-none flex items-center justify-center bg-black/10">
          <div className="bg-white px-4 py-2 rounded-lg shadow-sm font-medium text-sm text-gray-700 flex items-center">
            <MapPin size={16} className="mr-2 text-brand-600" />
            Cliquez sur la carte pour définir votre position
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-2 left-2 right-2 z-[400] bg-red-50 text-red-600 text-xs p-2 rounded-lg border border-red-100 shadow-sm">
          {error}
        </div>
      )}
    </div>
  );
};
