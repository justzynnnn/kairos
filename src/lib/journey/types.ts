export type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "google" | "seeded_demo";
};
export type JourneyStatus = {
  itemId: string;
  destinationLabel: string;
  durationMinutes: number;
  distanceMeters: number;
  leaveAt: string;
  predictedArrival: string;
  delayMinutes: number;
  freshAt: string;
  source: "google" | "seeded_demo";
  accuracyWarning: string;
};
