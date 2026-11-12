import { AtSign, Building2, Calendar, CalendarDays, CheckSquare, CircleDot, CreditCard, Hash, IdCard, ListChecks, Paperclip, PenLine, Phone, Signature, Type, UserRound, type LucideIcon } from "lucide-react";
import type { FieldType } from "@/lib/signing";

/** One icon per TossSign field type (builders and the signing page). */
export const FIELD_ICON: Record<FieldType, LucideIcon> = {
  signature: Signature,
  initials: PenLine,
  date: Calendar,
  fillable_date: CalendarDays,
  text: Type,
  name: UserRound,
  first_name: UserRound,
  middle_name: UserRound,
  last_name: UserRound,
  phone: Phone,
  cdl: CreditCard,
  email: AtSign,
  company: Building2,
  title: IdCard,
  number: Hash,
  dropdown: ListChecks,
  radio: CircleDot,
  checkbox: CheckSquare,
  attachment: Paperclip,
};
