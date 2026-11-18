// Tipos según docs/CONTRATOS.md
export type Role = 'CUSTOMER' | 'ORGANIZER' | 'DOORMAN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Sector {
  id: string;
  name: string;
  priceCents: number;
  capacity: number;
  available: number;
}

export interface EventItem {
  id: string;
  organizerId: string;
  name: string;
  description: string;
  venue: string;
  startsAt: string;
  imageUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  sectors: Sector[];
}

export interface Order {
  id: string;
  status: 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELLED';
  eventId: string;
  eventName: string | null;
  eventStartsAt: string | null;
  venue: string | null;
  sectorName: string | null;
  quantity: number;
  unitPriceCents: number | null;
  totalCents: number | null;
  failureCode: string | null;
  ticketsStatus: 'NOT_ISSUED' | 'ISSUED' | 'FAILED';
  notificationStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
  createdAt: string;
}

export interface Ticket {
  id: string;
  code: string;
  orderId: string;
  eventId: string;
  eventName: string;
  venue: string;
  eventStartsAt: string;
  sectorName: string;
  holderName: string;
  status: 'VALID' | 'VOID';
  pdfUrl: string;
}

export interface SalesReport {
  eventId: string;
  eventName: string;
  paidOrders: number;
  ticketsSold: number;
  revenueCents: number;
  rejectedOrders: number;
  bySector: { sectorId: string; sectorName: string; paidOrders: number; ticketsSold: number; revenueCents: number }[];
}

export interface ScanResult {
  allowed: boolean;
  reason: 'INVALID_CODE' | 'WRONG_EVENT' | 'TICKET_VOID' | 'ALREADY_USED' | null;
  checkedInAt?: string;
  firstCheckedInAt?: string;
  ticket?: { code: string; holderName: string; sectorName: string } | null;
  totalCheckedIn?: number;
}
