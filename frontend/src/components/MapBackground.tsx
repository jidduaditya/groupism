import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

const MapBackground = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => setCenter(DEFAULT_CENTER)
      );
    } else {
      setCenter(DEFAULT_CENTER);
    }
  }, []);

  useEffect(() => {
    if (!center || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png").addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [center]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <div ref={mapRef} className="w-full h-full" style={{ background: "var(--bg-base)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(245,240,232,0.55) 0%, rgba(245,240,232,0.75) 60%, rgba(245,240,232,0.92) 100%)" }} />
    </div>
  );
};

export default MapBackground;
