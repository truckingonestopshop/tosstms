import { AtSign, Building2, Calendar, CheckSquare, CircleDot, Hash, IdCard, ListChecks, Paperclip, PenLine, Signature, Type, UserRound, type LucideIcon } from "lucide-react";
import type { FieldType } from "@/lib/signing";

/** One icon per TossSign field type (builders and the signing page). */
export const FIELD_ICON: Record<FieldType, LucideIcon> = {
  signature: Signature,
  initials: PenLine,
  date: Calendar,
  text: Type,
  name: UserRound,
  email: AtSign,
  company: Building2,
  title: IdCard,
  number: Hash,
  dropdown: ListChecks,
  radio: CircleDot,
  checkbox: CheckSquare,
  attachment: Paperclip,
};
