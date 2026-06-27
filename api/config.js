export default function handler(req, res) {
  res.status(200).json({
    pixelId: process.env.META_PIXEL_ID || '',
    tiktokPixelId: process.env.TIKTOK_PIXEL_ID || '',
    purchaseValue: Number(process.env.PURCHASE_VALUE || 1),
    purchaseCurrency: process.env.PURCHASE_CURRENCY || 'MYR'
  });
}
