import { createIcon } from "./icon-base";

export type { IconProps } from "./icon-base";

const path = (d: string, key = d) => <path key={key} d={d} />;
const line = (x1: number, y1: number, x2: number, y2: number, key: string) => (
  <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} />
);
const circle = (cx: number, cy: number, r: number, key: string) => (
  <circle key={key} cx={cx} cy={cy} r={r} />
);
const rect = (x: number, y: number, width: number, height: number, rx: number, key: string) => (
  <rect key={key} x={x} y={y} width={width} height={height} rx={rx} />
);

/** The document-and-waveform geometry shared by the product mark and app icon. */
export const DocumentWaveformIcon = createIcon("DocumentWaveformIcon", [
  path("M7 3.5h7l4 4v13H7z", "document"),
  path("M14 3.5v4h4", "fold"),
  path("M3 13h4l1.6-3 2.3 6 2-4 1.8 2.6 1.7-3.1L18 13h3", "waveform"),
]);

export const ActivityIcon = createIcon("ActivityIcon", [
  path("M3 12h3.5l2-5 3.3 10 2.6-7 2 4H21"),
]);

export const TriangleAlertIcon = createIcon("TriangleAlertIcon", [
  path("M10.2 4.1 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.8 4.1a2.1 2.1 0 0 0-3.6 0Z"),
  line(12, 8.5, 12, 13.5, "stem"),
  circle(12, 17, 0.35, "dot"),
]);
export const TriangleAlert = TriangleAlertIcon;
export const AlertTriangle = TriangleAlertIcon;

export const ArrowDownLeftIcon = createIcon("ArrowDownLeftIcon", [
  path("M18.5 5.5 5.5 18.5"),
  path("M5.5 10v8.5H14"),
]);

export const ArrowDownRight = createIcon("ArrowDownRight", [
  path("m5.5 5.5 13 13"),
  path("M10 18.5h8.5V10"),
]);

export const ArrowLeftIcon = createIcon("ArrowLeftIcon", [
  line(20, 12, 4, 12, "shaft"),
  path("m10 6-6 6 6 6", "head"),
]);

export const ArrowRightIcon = createIcon("ArrowRightIcon", [
  line(4, 12, 20, 12, "shaft"),
  path("m14 6 6 6-6 6", "head"),
]);
export const ArrowRight = ArrowRightIcon;

export const ArrowUpRightIcon = createIcon("ArrowUpRightIcon", [
  path("M6 18 18 6"),
  path("M10 6h8v8"),
]);
export const ArrowUpRight = ArrowUpRightIcon;

export const AudioLines = createIcon("AudioLines", [
  line(5, 10, 5, 14, "one"),
  line(8.5, 7, 8.5, 17, "two"),
  line(12, 4, 12, 20, "three"),
  line(15.5, 8.5, 15.5, 15.5, "four"),
  line(19, 10.5, 19, 13.5, "five"),
]);

export const BadgeCheckIcon = createIcon("BadgeCheckIcon", [
  path("m12 3 2.2 1.4 2.6-.1.9 2.4 2.1 1.5-.6 2.5.6 2.5-2.1 1.5-.9 2.4-2.6-.1L12 21l-2.2-1.4-2.6.1-.9-2.4-2.1-1.5.6-2.5-.6-2.5 2.1-1.5.9-2.4 2.6.1Z"),
  path("m8.5 12 2.2 2.2 4.8-4.8", "check"),
]);

export const BanknoteIcon = createIcon("BanknoteIcon", [
  rect(2.75, 5.5, 18.5, 13, 2, "note"),
  circle(12, 12, 3, "coin"),
  path("M6.5 8.5H5.8v.7M17.5 15.5h.7v-.7", "corners"),
]);

export const BookOpenCheckIcon = createIcon("BookOpenCheckIcon", [
  path("M3.5 5.5c2.9-.8 5.7-.3 8.5 1.4v13c-2.8-1.7-5.6-2.2-8.5-1.4Z"),
  path("M12 6.9c2.8-1.7 5.6-2.2 8.5-1.4v13c-2.9-.8-5.7-.3-8.5 1.4"),
  path("m14.3 12.5 1.5 1.5 3-3", "check"),
]);

export const Building2Icon = createIcon("Building2Icon", [
  path("M5 20V4h11v16M16 9h3v11M3 20h18"),
  path("M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1", "windows"),
]);

const calendarFrame = [
  rect(3, 5, 18, 16, 2.25, "frame"),
  line(3, 9, 21, 9, "rule"),
  line(8, 3, 8, 7, "ring-left"),
  line(16, 3, 16, 7, "ring-right"),
];

export const CalendarDaysIcon = createIcon("CalendarDaysIcon", [
  ...calendarFrame,
  path("M7 13h2M12 13h2M17 13h.1M7 17h2M12 17h2M17 17h.1", "days"),
]);

export const CalendarPlusIcon = createIcon("CalendarPlusIcon", [
  ...calendarFrame,
  line(12, 12, 12, 18, "plus-v"),
  line(9, 15, 15, 15, "plus-h"),
]);

export const CalendarRangeIcon = createIcon("CalendarRangeIcon", [
  ...calendarFrame,
  circle(7.5, 14.5, 1, "start"),
  circle(16.5, 14.5, 1, "end"),
  line(9.5, 14.5, 14.5, 14.5, "range"),
]);

export const CalendarClockIcon = createIcon("CalendarClockIcon", [
  ...calendarFrame,
  circle(14.5, 15, 3.5, "clock"),
  path("M14.5 13v2.2l1.5 1", "hands"),
]);

export const CheckIcon = createIcon("CheckIcon", [path("m4.5 12.5 4.5 4.5 10.5-10.5")]);
export const Check = CheckIcon;

export const CircleCheckIcon = createIcon("CircleCheckIcon", [
  circle(12, 12, 9, "circle"),
  path("m7.8 12.2 2.8 2.8 5.8-6", "check"),
]);
export const CircleCheckBigIcon = CircleCheckIcon;
export const CheckCircle2Icon = CircleCheckIcon;

export const ChevronRightIcon = createIcon("ChevronRightIcon", [path("m9 5.5 6.5 6.5L9 18.5")]);
export const ChevronRight = ChevronRightIcon;

export const CircleAlertIcon = createIcon("CircleAlertIcon", [
  circle(12, 12, 9, "circle"),
  line(12, 7.5, 12, 13, "stem"),
  circle(12, 16.7, 0.35, "dot"),
]);

const clipboardFrame = [
  path("M8.5 5H6.7A1.7 1.7 0 0 0 5 6.7v13.6h14V6.7A1.7 1.7 0 0 0 17.3 5h-1.8", "board"),
  rect(8.5, 3, 7, 4, 1.5, "clip"),
];

export const ClipboardClockIcon = createIcon("ClipboardClockIcon", [
  ...clipboardFrame,
  circle(12.5, 14, 3.5, "clock"),
  path("M12.5 12v2.2l1.5 1", "hands"),
]);

export const ClipboardListIcon = createIcon("ClipboardListIcon", [
  ...clipboardFrame,
  path("M9 11h.1M12 11h4M9 15h.1M12 15h4", "list"),
]);

export const ClipboardPenLineIcon = createIcon("ClipboardPenLineIcon", [
  ...clipboardFrame,
  path("m9 16 .5-2.8 5.6-5.6 2.3 2.3-5.6 5.6Z", "pen"),
  line(8.5, 18, 15.5, 18, "line"),
]);

export const Clock3Icon = createIcon("Clock3Icon", [
  circle(12, 12, 9, "circle"),
  path("M12 7v5h5", "hands"),
]);

const fileFrame = [
  path("M6 3.5h7l5 5v12H6Z", "file"),
  path("M13 3.5v5h5", "fold"),
];

export const FileClock = createIcon("FileClock", [
  ...fileFrame,
  circle(11.5, 14.5, 3.25, "clock"),
  path("M11.5 12.7v2l1.4.9", "hands"),
]);

export const FilePenLine = createIcon("FilePenLine", [
  ...fileFrame,
  path("m8.5 16.5.4-2.4 5.3-5.3 2.1 2.1-5.3 5.3Z", "pen"),
  line(8.5, 18.5, 15.5, 18.5, "line"),
]);

export const FileTextIcon = createIcon("FileTextIcon", [
  ...fileFrame,
  line(9, 12, 15, 12, "line-one"),
  line(9, 15.5, 15, 15.5, "line-two"),
]);

export const HistoryIcon = createIcon("HistoryIcon", [
  path("M4 9V4m0 0h5M4 4l3.2 3.2"),
  path("M5.7 17.4A8.5 8.5 0 1 0 4 9"),
  path("M12 7.5V12l3 1.8", "hands"),
]);

export const LandmarkIcon = createIcon("LandmarkIcon", [
  path("m3 8 9-5 9 5Z"),
  line(4, 20, 20, 20, "base"),
  line(3, 17, 21, 17, "step"),
  path("M6 9v6M10 9v6M14 9v6M18 9v6", "columns"),
]);

export const LanguagesIcon = createIcon("LanguagesIcon", [
  path("M3.5 18 8 6l4.5 12M5.3 14h5.4", "latin"),
  path("M14 7h7M17.5 5v2c0 4.8-1.4 8.3-4.2 10.5M15 12.5c1.4 2.3 3.3 4.1 5.8 5.5", "translate"),
]);

export const LayoutDashboardIcon = createIcon("LayoutDashboardIcon", [
  rect(3, 3, 7, 11, 1.5, "left-top"),
  rect(3, 17, 7, 4, 1.5, "left-bottom"),
  rect(13, 3, 8, 5, 1.5, "right-top"),
  rect(13, 11, 8, 10, 1.5, "right-bottom"),
]);

export const LoaderCircleIcon = createIcon("LoaderCircleIcon", [
  path("M12 3a9 9 0 0 1 8.5 6", "arc-one"),
  path("M21 12a9 9 0 0 1-8.8 9", "arc-two"),
  path("M9 20.5A9 9 0 0 1 3.2 14", "arc-three"),
  path("M3.5 10A9 9 0 0 1 8 4", "arc-four"),
]);
export const Loader2Icon = LoaderCircleIcon;
export const Loader2 = LoaderCircleIcon;

export const Lock = createIcon("Lock", [
  rect(4.5, 10, 15, 11, 2.25, "body"),
  path("M8 10V7.5a4 4 0 0 1 8 0V10", "shackle"),
]);

export const LockKeyholeIcon = createIcon("LockKeyholeIcon", [
  rect(4.5, 10, 15, 11, 2.25, "body"),
  path("M8 10V7.5a4 4 0 0 1 8 0V10", "shackle"),
  circle(12, 15, 1, "keyhole"),
  line(12, 16, 12, 18, "key-slot"),
]);

export const LogOutIcon = createIcon("LogOutIcon", [
  path("M10 4H5v16h5"),
  line(9, 12, 21, 12, "shaft"),
  path("m16 7 5 5-5 5", "head"),
]);

export const MailIcon = createIcon("MailIcon", [
  rect(2.5, 5, 19, 14, 2.25, "envelope"),
  path("m4 7 8 6 8-6", "flap"),
]);

export const MailCheckIcon = createIcon("MailCheckIcon", [
  rect(2.5, 5, 19, 14, 2.25, "envelope"),
  path("m4 7 8 6 8-6", "flap"),
  path("m13.5 16 1.7 1.7 3.8-4", "check"),
]);

export const Mic = createIcon("Mic", [
  rect(9, 3, 6, 11, 3, "capsule"),
  path("M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6", "stand"),
]);
export const Mic2Icon = Mic;

export const MoonIcon = createIcon("MoonIcon", [
  path("M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.7 8.7 0 1 0 20.2 15.4Z"),
]);

export const NotebookPenIcon = createIcon("NotebookPenIcon", [
  path("M6 3.5h13v17H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"),
  line(8, 3.5, 8, 20.5, "binding"),
  path("m11 16 .5-2.4 4.8-4.8 2.1 2.1-4.8 4.8Z", "pen"),
]);

export const PaletteIcon = createIcon("PaletteIcon", [
  path("M12 3a9 9 0 0 0 0 18h1.2a1.8 1.8 0 0 0 1.4-2.9 1.8 1.8 0 0 1 1.4-2.9h2a3 3 0 0 0 3-3.1A9 9 0 0 0 12 3Z"),
  circle(7.5, 10, 0.65, "color-one"),
  circle(10.5, 6.8, 0.65, "color-two"),
  circle(15, 7.5, 0.65, "color-three"),
]);

export const PencilLineIcon = createIcon("PencilLineIcon", [
  path("m4 16.5-.5 4 4-.5L19 8.5 15.5 5Z"),
  line(13.8, 6.7, 17.3, 10.2, "seam"),
  line(3.5, 21, 11, 21, "line"),
]);
export const PencilIcon = PencilLineIcon;

export const PhoneIcon = createIcon("PhoneIcon", [
  path("M7.2 3.5 4.3 5.2c-.8.5-1.1 1.5-.8 2.4 2.1 6.2 6.8 10.9 13 13 .9.3 1.9 0 2.4-.8l1.6-2.9-4.5-2.5-1.5 2.1a13.1 13.1 0 0 1-7-7L9.7 8Z"),
]);

export const PillIcon = createIcon("PillIcon", [
  path("M8.2 19.5a4.7 4.7 0 0 1-6.7-6.7L12.8 1.5a4.7 4.7 0 1 1 6.7 6.7Z"),
  line(7.2, 7.2, 13.8, 13.8, "seam"),
]);

export const PlusIcon = createIcon("PlusIcon", [
  line(12, 4, 12, 20, "vertical"),
  line(4, 12, 20, 12, "horizontal"),
]);
export const Plus = PlusIcon;

export const PrinterIcon = createIcon("PrinterIcon", [
  path("M7 8V3.5h10V8M7 17H4.5A2.5 2.5 0 0 1 2 14.5v-4A2.5 2.5 0 0 1 4.5 8h15a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H17"),
  rect(7, 14, 10, 7, 1, "paper"),
  circle(18.5, 11.5, 0.4, "status"),
]);

export const Quote = createIcon("Quote", [
  path("M4 11.5h6V19H3.5v-4.2c0-5 2.2-8 6.5-9.8"),
  path("M14 11.5h6V19h-6.5v-4.2c0-5 2.2-8 6.5-9.8"),
]);

export const ReceiptTextIcon = createIcon("ReceiptTextIcon", [
  path("M5 3.5 7 5l2-1.5L11 5l2-1.5L15 5l2-1.5L19 5v16l-2-1.5L15 21l-2-1.5L11 21l-2-1.5L7 21l-2-1.5Z"),
  line(8, 9, 16, 9, "line-one"),
  line(8, 13, 16, 13, "line-two"),
  line(8, 17, 13, 17, "line-three"),
]);

export const SaveIcon = createIcon("SaveIcon", [
  path("M4 3.5h13l3 3v14H4Z"),
  rect(8, 3.5, 7, 5, 0.5, "label"),
  rect(7.5, 13, 9, 7.5, 1, "data"),
]);

export const SearchIcon = createIcon("SearchIcon", [
  circle(10.5, 10.5, 6.5, "lens"),
  line(15.5, 15.5, 21, 21, "handle"),
]);
export const Search = SearchIcon;

export const SendHorizontal = createIcon("SendHorizontal", [
  path("m3 4 18 8-18 8 3-8Z"),
  line(6, 12, 21, 12, "shaft"),
]);

export const Settings2Icon = createIcon("Settings2Icon", [
  line(4, 7, 20, 7, "top"),
  circle(9, 7, 2, "top-control"),
  line(4, 17, 20, 17, "bottom"),
  circle(15, 17, 2, "bottom-control"),
]);

export const ShieldCheckIcon = createIcon("ShieldCheckIcon", [
  path("M12 3 20 6v5.5c0 4.8-3.1 8-8 9.5-4.9-1.5-8-4.7-8-9.5V6Z"),
  path("m8 12 2.5 2.5L16 9", "check"),
]);
export const ShieldCheck = ShieldCheckIcon;

export const SparklesIcon = createIcon("SparklesIcon", [
  path("M12 2.5c.4 3.8 2.1 5.5 5.5 6-3.4.5-5.1 2.2-5.5 6-.4-3.8-2.1-5.5-5.5-6 3.4-.5 5.1-2.2 5.5-6Z"),
  path("M18.5 14.5c.2 2 1.1 2.9 3 3.2-1.9.3-2.8 1.2-3 3.3-.2-2.1-1.1-3-3-3.3 1.9-.3 2.8-1.2 3-3.2Z", "small"),
  path("M5 14c.2 1.2.7 1.8 1.8 2-1.1.2-1.6.8-1.8 2-.2-1.2-.7-1.8-1.8-2 1.1-.2 1.6-.8 1.8-2Z", "tiny"),
]);

export const Square = createIcon("Square", [rect(4, 4, 16, 16, 2, "square")]);

export const StethoscopeIcon = createIcon("StethoscopeIcon", [
  path("M6 4v5a4 4 0 0 0 8 0V4M4.5 4h3M12.5 4h3M10 13v1.5a5 5 0 0 0 10 0v-1"),
  circle(20, 11, 2, "chest-piece"),
]);

export const SunIcon = createIcon("SunIcon", [
  circle(12, 12, 3.5, "sun"),
  path("M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4", "rays"),
]);

export const Table2 = createIcon("Table2", [
  rect(3, 4, 18, 16, 2, "table"),
  line(3, 9, 21, 9, "header"),
  line(9, 9, 9, 20, "column-one"),
  line(15, 9, 15, 20, "column-two"),
  line(3, 14.5, 21, 14.5, "row"),
]);

export const Trash2 = createIcon("Trash2", [
  path("M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14"),
  line(10, 11, 10.5, 17, "slot-one"),
  line(14, 11, 13.5, 17, "slot-two"),
]);

export const UserRoundIcon = createIcon("UserRoundIcon", [
  circle(12, 8, 4, "head"),
  path("M4.5 21a7.5 7.5 0 0 1 15 0", "shoulders"),
]);

export const UserPlus = createIcon("UserPlus", [
  circle(9, 8, 4, "head"),
  path("M2.5 21a6.5 6.5 0 0 1 13 0", "shoulders"),
  line(19, 10, 19, 16, "plus-v"),
  line(16, 13, 22, 13, "plus-h"),
]);

export const UsersRoundIcon = createIcon("UsersRoundIcon", [
  circle(9, 8, 3.5, "head-one"),
  path("M2.5 20a6.5 6.5 0 0 1 13 0", "shoulders-one"),
  path("M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.5a5.2 5.2 0 0 1 4 5.5", "person-two"),
]);

export const WalletCardsIcon = createIcon("WalletCardsIcon", [
  path("M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2Z"),
  path("M3 9h17M16 12h6v4h-6a2 2 0 0 1 0-4Z"),
  circle(17, 14, 0.35, "stud"),
]);

export const XIcon = createIcon("XIcon", [
  line(5, 5, 19, 19, "down"),
  line(19, 5, 5, 19, "up"),
]);
export const X = XIcon;
