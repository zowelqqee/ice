import type { TourDate } from "./data";

/** What the ticket button of a date says (and whether it links anywhere). */
export function ticketState(d: Pick<TourDate, "tickets" | "status">): "tickets" | "soon" | "soldOut" | "cancelled" {
  if (d.status === "cancelled") return "cancelled";
  if (d.status === "sold_out") return "soldOut";
  return d.tickets ? "tickets" : "soon";
}
