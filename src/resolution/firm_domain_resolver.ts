export function resolveDomain(firm:string){
  return firm
    .toLowerCase()
    .replace(/[^a-z0-9]/g,"")
    + ".com";
}
