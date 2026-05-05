# Website Images

Drop your own photos into this folder and update the `src` or CSS background references in:
- `website/index.html`
- `website/blog.html`

## Hero image
Replace `../assets/images/LuxuryVan.png` with a high-quality photo of one of your vehicles.
Recommended size: **1200 × 750 px** (16:10 ratio).

## Blog / article images
In `blog.html`, the article image cards use CSS gradient backgrounds as placeholders.
To use a real photo, add an `style="background-image: url('images/your-photo.jpg'); background-size:cover; background-position:center"` 
attribute to the `.article-img` div.

## App Store badge images
Replace `website/assets/app-store.svg` and `website/assets/google-play.svg` with the official badges:
- Apple: https://developer.apple.com/app-store/marketing/guidelines/#badge
- Google: https://play.google.com/intl/en_us/badges/

## QR code
Replace the placeholder `<div class="qr-placeholder">` in `index.html` with a real `<img>` tag 
pointing to a QR code image generated from your app store link.
Generate one free at: https://qr.io or https://www.qrcode-monkey.com
