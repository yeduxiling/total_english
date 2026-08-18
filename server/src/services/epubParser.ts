import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COVERS_DIR = path.join(__dirname, '../../data/books/covers');

export interface EpubMetadata {
  title: string;
  author: string;
  coverPath: string | null; // 相对路径: covers/{bookId}.jpg
}

/**
 * 从 EPUB 文件中提取元数据（标题、作者、封面）
 * EPUB 本质上是 ZIP 文件，内部结构：
 *   META-INF/container.xml → 指向 OPF 文件路径
 *   *.opf → 包含 dc:title, dc:creator, manifest (含封面引用)
 */
export function parseEpubMetadata(epubFilePath: string, bookId: string): EpubMetadata {
  const zip = new AdmZip(epubFilePath);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['item', 'itemref'].includes(name),
  });

  // 1. 读取 container.xml 获取 OPF 文件路径
  const containerEntry = zip.getEntry('META-INF/container.xml');
  if (!containerEntry) {
    throw new Error('Invalid EPUB: missing META-INF/container.xml');
  }
  const containerXml = containerEntry.getData().toString('utf-8');
  const container = parser.parse(containerXml);
  const rootfile = container?.container?.rootfiles?.rootfile;
  const opfPath = rootfile?.['@_full-path'] || rootfile?.[0]?.['@_full-path'];
  if (!opfPath) {
    throw new Error('Invalid EPUB: cannot locate OPF file');
  }

  // 2. 读取 OPF 文件提取元数据
  const opfEntry = zip.getEntry(opfPath);
  if (!opfEntry) {
    throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
  }
  const opfXml = opfEntry.getData().toString('utf-8');
  const opf = parser.parse(opfXml);
  const pkg = opf?.['package'] || opf?.['opf:package'];
  const metadata = pkg?.metadata || pkg?.['opf:metadata'];
  const manifest = pkg?.manifest;

  // 提取标题
  const dcTitle = metadata?.['dc:title'];
  const title = typeof dcTitle === 'string'
    ? dcTitle
    : (dcTitle?.['#text'] || dcTitle?.[0]?.['#text'] || dcTitle?.[0] || 'Untitled');

  // 提取作者
  const dcCreator = metadata?.['dc:creator'];
  const author = typeof dcCreator === 'string'
    ? dcCreator
    : (dcCreator?.['#text'] || dcCreator?.[0]?.['#text'] || dcCreator?.[0] || 'Unknown');

  // 3. 提取封面图片
  let coverPath: string | null = null;
  const opfDir = path.dirname(opfPath);

  try {
    const items: any[] = manifest?.item || [];

    // 策略 1: 查找 metadata 中的 cover meta 引用
    let coverItemId: string | null = null;
    const metas = metadata?.meta;
    if (Array.isArray(metas)) {
      const coverMeta = metas.find((m: any) => m?.['@_name'] === 'cover');
      coverItemId = coverMeta?.['@_content'] || null;
    } else if (metas?.['@_name'] === 'cover') {
      coverItemId = metas?.['@_content'] || null;
    }

    // 策略 2: 查找 properties="cover-image" 的 item (EPUB3)
    let coverItem = coverItemId
      ? items.find((item: any) => item?.['@_id'] === coverItemId)
      : items.find((item: any) => item?.['@_properties']?.includes('cover-image'));

    // 策略 3: 查找 id 或 href 中包含 "cover" 且 media-type 为图片的 item
    if (!coverItem) {
      coverItem = items.find((item: any) => {
        const id = (item?.['@_id'] || '').toLowerCase();
        const href = (item?.['@_href'] || '').toLowerCase();
        const mediaType = (item?.['@_media-type'] || '').toLowerCase();
        return (id.includes('cover') || href.includes('cover')) && mediaType.startsWith('image/');
      });
    }

    if (coverItem) {
      const coverHref = coverItem['@_href'];
      // 封面路径相对于 OPF 文件所在目录
      const coverEntryPath = opfDir === '.' ? coverHref : `${opfDir}/${coverHref}`;
      const coverEntry = zip.getEntry(coverEntryPath);

      if (coverEntry) {
        // 确保目录存在
        fs.mkdirSync(COVERS_DIR, { recursive: true });

        // 根据 media-type 确定扩展名
        const mediaType = coverItem['@_media-type'] || '';
        const ext = mediaType.includes('png') ? '.png' : '.jpg';
        const coverFileName = `${bookId}${ext}`;
        const coverFullPath = path.join(COVERS_DIR, coverFileName);

        fs.writeFileSync(coverFullPath, coverEntry.getData());
        coverPath = `covers/${coverFileName}`;
      }
    }
  } catch (e) {
    // 封面提取失败不影响整体流程
    console.warn('Warning: Failed to extract cover image:', (e as Error).message);
  }

  return {
    title: String(title).trim(),
    author: String(author).trim(),
    coverPath,
  };
}
