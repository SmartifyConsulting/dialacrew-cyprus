import { describe, it, expect } from "vitest";
import { taskAssignees } from "@/lib/task-assignees";
describe("production task assignees", () => {
  it("includes members from all departments and pending/pencilled bookings", () => {
    const members = [{crew_id:"1",name:"Camera",booking_status:"pencilled",department:"Camera"},{crew_id:"2",name:"Sound",booking_status:"confirmed",department:"Sound"}];
    expect(taskAssignees(members)).toEqual(members);
  });
  it("deduplicates repeated shoot days, excludes cancelled bookings and keeps separate people with the same name", () => {
    const members = [{crew_id:"1",name:"Sam",booking_status:"confirmed"},{crew_id:"1",name:"Sam",booking_status:"confirmed"},{crew_id:"2",name:"Sam",booking_status:"pencilled"},{crew_id:"3",name:"Alex",booking_status:"cancelled"}];
    expect(taskAssignees(members).map(m => m.crew_id)).toEqual(["1","2"]);
  });
});
