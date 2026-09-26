"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  amountDue: number;
  status: "due_today" | "overdue" | "completed" | "upcoming";
  priority: boolean;
  dueDate: string;
  collectionId: string | null;
};

const statusColors: Record<Customer["status"], string> = {
  due_today: "#f59e0b",
  overdue: "#f43f5e",
  completed: "#10b981",
  upcoming: "#3b82f6",
};

function FitBounds({ customers }: { customers: Customer[] }) {
  const map = useMap();

  useEffect(() => {
    if (customers.length === 1) {
      map.setView([customers[0].latitude!, customers[0].longitude!], 14);
      return;
    }
    if (customers.length > 1) {
      const bounds: LatLngBoundsExpression = customers.map((customer) => [
        customer.latitude!,
        customer.longitude!,
      ]);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }, [customers, map]);

  return null;
}

export default function LeafletMap({
  customers,
  selectedId,
  onSelect,
}: {
  customers: Customer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const located = customers.filter(
    (customer) => customer.latitude !== null && customer.longitude !== null,
  );

  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl">
      <MapContainer
        center={[5.6037, -0.187]}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds customers={located} />
        {located.map((customer) => (
          <CircleMarker
            key={customer.id}
            center={[customer.latitude!, customer.longitude!]}
            radius={customer.id === selectedId ? 12 : 9}
            pathOptions={{
              color: "#ffffff",
              fillColor: statusColors[customer.status],
              fillOpacity: 1,
              weight: customer.priority ? 4 : 2,
            }}
            eventHandlers={{ click: () => onSelect(customer.id) }}
          >
            <Popup>
              <div className="min-w-40">
                <p className="font-semibold text-slate-900">{customer.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {customer.address || "No address recorded"}
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  GH₵
                  {customer.amountDue.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  due
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {!located.length && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-8 text-center">
          <div className="rounded-xl bg-white/95 p-5 text-sm text-slate-600 shadow-sm">
            <p className="font-semibold">No coordinates recorded yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Customers remain protected and listed below until their latitude
              and longitude are added.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
