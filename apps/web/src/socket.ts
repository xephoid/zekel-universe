import { io, type Socket } from 'socket.io-client';
import type { TableEventWire } from '@universe/shared';

export interface TableSocketHandlers {
  onEvent: (e: TableEventWire) => void;
  onRejected: (r: { reason: string; lesson?: string }) => void;
}

/** Joins the table room; reconnects automatically (Socket.IO resumes with
 *  the last-seen sequence — the queue resumes from the events fetch). */
export function connectTable(tableId: string, h: TableSocketHandlers): Socket {
  const socket = io({ withCredentials: true });
  socket.emit('join_table', { tableId });
  socket.on('event', h.onEvent);
  socket.on('rejected', h.onRejected);
  return socket;
}
