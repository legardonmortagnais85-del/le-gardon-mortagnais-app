/** Convertit une suggestion en mm provenant de l'API en une estimation au cm entier.
 *  Le staff garde la possibilité de corriger le champ mm au millimètre près.
 *  Aucun calcul ne peut rendre une photo plus précise que ses graduations.
 */
export function cmEstimateFromMm(lengthMm){
  if(!Number.isInteger(lengthMm)||lengthMm<1||lengthMm>3000)return null;
  const cm=Math.max(1,Math.round(lengthMm/10));
  return {cm,mm:cm*10};
}
