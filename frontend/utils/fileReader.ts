// utils/fileReader.ts
// Note: import pdfjs dynamically inside `readPdfAsText` to avoid Vite pre-transform resolution issues

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsText(file);
  });
};

export const readPdfAsText = async (file: File): Promise<string> => {
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = async (event) => {
      if (!event.target?.result) {
        return reject('Could not read file');
      }
      
      const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
      
      try {
        // Dynamically import pdfjs so Vite doesn't fail pre-transforming the module path
        const pdfjsLib = await import('pdfjs-dist/build/pdf.js');
        // Configure the worker from CDN (uses the installed version if available)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as any).version}/pdf.worker.min.js`;
        } catch {}

        const pdf = await (pdfjsLib as any).getDocument(typedarray).promise;
        let textContent = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const text = await page.getTextContent();
          textContent += text.items.map(item => (item as any).str).join(' ');
          textContent += '\n'; // Add a newline between pages
        }
        
        resolve(textContent);
      } catch (error) {
        reject(`Error parsing PDF: ${error}`);
      }
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
    
    reader.readAsArrayBuffer(file);
  });
};
