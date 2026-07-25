/**
 * A guest ID uploaded as a PDF is stored by Cloudinary with a `.pdf` URL, which
 * an <img> tag can't render. Rewrite it to a first-page JPG (`pg_1`) so it shows
 * like any other ID photo everywhere in the app (admin, consent form, etc.).
 * Non-PDF URLs are returned unchanged.
 */
export function pdfToImage(url: string): string {
  return /\.pdf$/i.test(url)
    ? url.replace("/upload/", "/upload/pg_1/").replace(/\.pdf$/i, ".jpg")
    : url;
}
