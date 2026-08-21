export async function renderSkinHead(textureUrl: string, size = 32): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const scale = image.naturalWidth / 64
      if (!scale || image.naturalHeight < 64 * scale) {
        resolve(null)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(null)
        return
      }
      context.imageSmoothingEnabled = false
      const sourceSize = 8 * scale
      const destinationSize = size
      context.drawImage(image, 8 * scale, 8 * scale, sourceSize, sourceSize, 0, 0, destinationSize, destinationSize)
      context.drawImage(image, 40 * scale, 8 * scale, sourceSize, sourceSize, 0, 0, destinationSize, destinationSize)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => resolve(null)
    image.src = textureUrl
  })
}