export type TableShape = 'round' | 'tall-bar' | 'square';
export type TableStatus = 'available' | 'occupied' | 'waiting_food' | 'billing';

export interface SalonTable {
  id: number;
  label: string;
  shape: TableShape;
  status: TableStatus;
  capacity: number;
  position: { x: number; y: number }; 
  activeOrderId?: string;
  currentTotal?: number;
  minutesElapsed?: number;
}
