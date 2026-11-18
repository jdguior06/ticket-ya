import { ApiError } from './api';

// Texto para el usuario según el `code` del contrato.
const BY_CODE: Record<string, string> = {
  SOLD_OUT: 'No quedan entradas suficientes en este sector. Prueba con menos entradas u otro sector.',
  EVENT_NOT_AVAILABLE: 'Este evento ya no está a la venta.',
  PAYMENT_PENDING: 'No pudimos confirmar el pago. Tu cupo está reservado: revisa Mis compras en unos minutos.',
  DEPENDENCY_UNAVAILABLE: 'Uno de los servicios no responde. Intenta de nuevo en unos minutos.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  EMAIL_TAKEN: 'Ya hay una cuenta con ese correo. Inicia sesión.',
  UNAUTHORIZED: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para esto.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  CAPACITY_BELOW_SOLD: 'El cupo no puede ser menor que las entradas ya vendidas.',
  SECTOR_HAS_SALES: 'Ese sector ya tiene ventas y no se puede eliminar.',
  EVENT_NOT_EDITABLE: 'Un evento cancelado no se puede editar.',
  EVENT_IN_PAST: 'La fecha del evento ya pasó: cámbiala antes de publicar.',
  NO_SECTORS: 'Agrega al menos un sector antes de publicar.',
  NETWORK: 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.',
};

const PAYMENT_REASON: Record<string, string> = {
  CARD_DECLINED: 'El banco rechazó la tarjeta.',
  INSUFFICIENT_FUNDS: 'La tarjeta no tiene fondos suficientes.',
  CARD_EXPIRED: 'La tarjeta está vencida.',
};

export function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Algo salió mal. Intenta de nuevo.';
  if (err.code === 'PAYMENT_REJECTED') {
    const reason = String(err.details.reason ?? '');
    return `${PAYMENT_REASON[reason] ?? 'El pago fue rechazado.'} No se cobró nada y tu cupo se liberó.`;
  }
  if (err.code === 'VALIDATION_ERROR') {
    const fields = err.details.fields as Record<string, string[]> | undefined;
    if (fields) return Object.values(fields).flat().join(' ');
  }
  return BY_CODE[err.code] ?? err.message;
}

export const ORDER_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  PAID: { label: 'Pagada', tone: 'ok' },
  PENDING: { label: 'Confirmando pago', tone: 'warn' },
  REJECTED: { label: 'Pago rechazado', tone: 'bad' },
  CANCELLED: { label: 'Cancelada', tone: 'muted' },
};

export const FAILURE_TEXT: Record<string, string> = {
  SOLD_OUT: 'No había cupo suficiente.',
  EVENT_NOT_AVAILABLE: 'El evento ya no estaba a la venta.',
  CARD_DECLINED: PAYMENT_REASON.CARD_DECLINED,
  INSUFFICIENT_FUNDS: PAYMENT_REASON.INSUFFICIENT_FUNDS,
  CARD_EXPIRED: PAYMENT_REASON.CARD_EXPIRED,
  PAYMENT_TIMEOUT: 'No se pudo confirmar el pago a tiempo. No se cobró nada.',
  EVENTS_UNAVAILABLE: 'El servicio de eventos no respondía.',
};

export const SCAN_REASON: Record<string, string> = {
  INVALID_CODE: 'Código no válido',
  WRONG_EVENT: 'Entrada de otro evento',
  TICKET_VOID: 'Entrada anulada',
  ALREADY_USED: 'Esta entrada ya ingresó',
};
