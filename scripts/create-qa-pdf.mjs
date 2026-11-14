// Synthetic, non-personal PDF fixture for storyboard extraction tests.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const output=resolve(process.argv[2]??'docs/verification/qa-storyboard-brief.pdf');
const lines=['QA TEST ONLY - SYNTHETIC STORYBOARD BRIEF','Title: The Blue Parcel','Scene 1: A courier in a red jacket enters an empty studio.','Scene 2: The courier places a small blue parcel on a table.','Scene 3: Close-up of the parcel, then fade to black.','Keep the same courier, jacket and blue parcel in all shots.'];
const escape=text=>text.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
const stream='BT /F1 12 Tf 50 740 Td '+lines.map((line,index)=>(index?'0 -24 Td ':'')+`(${escape(line)}) Tj`).join('\n')+' ET\n';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;mkdirSync(dirname(output),{recursive:true});writeFileSync(output,pdf);console.log('Created synthetic PDF fixture: '+output);
