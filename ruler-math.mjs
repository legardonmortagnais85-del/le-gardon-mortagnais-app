/** Deux points servent à repérer la bouche contre le zéro et le bout de la queue.
 * L'échelle de l'image est inconnue : la longueur est lue manuellement sur la toise,
 * jamais calculée à partir de la distance entre ces points.
 */
export function validateTwoPointRuler(marks, readMm, imageWidth, imageHeight) {
 if (!Array.isArray(marks) || marks.length !== 2 || !marks.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1)) {
  return {error:'Sélectionne exactement les 2 repères : zéro et queue.'};
 }
 if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth<=0 || imageHeight<=0) {
  return {error:'La photo est introuvable ou illisible.'};
 }
 const dx=(marks[1].x-marks[0].x)*imageWidth;
 const dy=(marks[1].y-marks[0].y)*imageHeight;
 if (Math.hypot(dx,dy)<12) return {error:'Les deux repères sont trop proches : replace la queue.'};
 if (typeof readMm !== 'string' || !/^\d{1,4}$/.test(readMm.trim())) {
  return {error:'Indique la longueur que tu lis sur la toise, en mm (nombre entier).'};
 }
 const value=Number(readMm.trim());
 if (!Number.isInteger(value)||value<1||value>3000) return {error:'Longueur invalide : entre 1 et 3 000 mm.'};
 return {value,source:'lecture_staff',automatic:false};
}
