// functions/src/pdf-parse.d.ts
// Declaración de tipos para pdf-parse (el paquete no tiene @types/pdf-parse).
// Ver: https://github.com/modesty/pdf2json
declare module 'pdf-parse' {
  interface PDFData {
    numpages: number
    numrender: number
    info: Record<string, any>
    metadata: any
    version: string
    text: string
  }
  function PDFParse(dataBuffer: Buffer, options?: any): Promise<PDFData>
  export default PDFParse
}