// Downscales a user-selected photo before it ever leaves the browser — a raw
// phone photo can be several MB, which is both slow to upload and needlessly
// expensive to send to a vision model. Re-encoding as JPEG at a bounded
// dimension keeps the payload to a couple hundred KB with no visible loss for
// reading a printed label.
export function resizeImageFile(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the selected file"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read the selected image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
