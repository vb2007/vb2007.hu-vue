import type { IconName } from "@/components/ui/AppIcon.vue";
import type { UploadCategory } from "@/scripts/uploads/upload";

/** The icon each upload category is drawn with. */
export const CATEGORY_ICONS: Record<UploadCategory, IconName> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  archive: "archive"
};
