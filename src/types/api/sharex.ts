/**
 * A ShareX custom uploader as `GET /sharex/<name>.sxcu` serves it (vb2007/vb2007.hu-api#573):
 * ShareX's own fields, which the site passes on as they are. Only the key's header is read here.
 */
export interface SharexUploader {
  Name: string;
  /** `Bearer vbk_YOUR_TOKEN` (`Sharex.tokenPlaceholder`), for the key's token to replace. */
  Headers: { Authorization: string };
  [field: string]: unknown;
}
