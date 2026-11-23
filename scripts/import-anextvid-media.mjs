import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const CONTENT_ROOT =
  process.env.ANEXTVID_CONTENT_ROOT ||
  "/Users/jahroinimo/Desktop/my linkedin saas/my-post sceduling saas/ANEXTPOST/ANEXTVID_LinkedIn_Content";
const REPO_ROOT =
  "/Users/jahroinimo/Desktop/my linkedin saas/my-post sceduling saas/ANEXTPOST/anextpost";
const UPLOAD_ROOT = path.join(REPO_ROOT, "apps/backend/uploads");
const MANIFEST_PATH = path.join(UPLOAD_ROOT, "anextvid-import-manifest.json");
const ORG_ID =
  process.env.ANEXTVID_ORG_ID || "c0019842-17c2-44da-a588-08723143ff91";

const ASSET_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function toReadableCollectionName(rawFolderName) {
  return rawFolderName
    .replace(/^ANEXTVID_/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function walkContentFolders(rootDir) {
  const sets = [];
  let skippedContactSheets = 0;
  let skippedTextFiles = 0;
  let skippedEmptyFolders = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const subdirs = entries.filter((e) => e.isDirectory());
    const files = entries
      .filter((e) => e.isFile() && e.name !== ".DS_Store")
      .map((e) => e.name);

    if (subdirs.length === 0 && files.length === 0) {
      skippedEmptyFolders += 1;
      return;
    }

    const assetFiles = [];
    for (const file of files) {
      const low = file.toLowerCase();
      const ext = path.extname(file).toLowerCase();
      if (low.includes("contact_sheet") || low.includes("contact sheet")) {
        skippedContactSheets += 1;
      } else if (ext === ".txt") {
        skippedTextFiles += 1;
      } else if (ASSET_EXTS.has(ext)) {
        assetFiles.push(path.join(dir, file));
      }
    }

    if (assetFiles.length > 0) {
      const rel = path.relative(rootDir, dir);
      const parts = rel.split(path.sep);
      const leaf = parts[parts.length - 1];
      const setFolder =
        ["01_images", "individual_images", "images"].includes(leaf.toLowerCase()) &&
        parts.length >= 2
          ? parts[parts.length - 2]
          : leaf;
      sets.push({
        relDir: rel,
        rawSetName: setFolder,
        collectionName: toReadableCollectionName(setFolder),
        files: assetFiles,
      });
    }

    for (const sub of subdirs) {
      walk(path.join(dir, sub.name));
    }
  }

  walk(rootDir);

  // Disambiguate any duplicate readable names if they ever occur
  const nameCounts = new Map();
  for (const s of sets) {
    nameCounts.set(s.collectionName, (nameCounts.get(s.collectionName) || 0) + 1);
  }
  for (const s of sets) {
    if ((nameCounts.get(s.collectionName) || 0) > 1) {
      const category = toReadableCollectionName(s.relDir.split(path.sep)[0]);
      s.collectionName = `${s.collectionName} (${category})`;
    }
  }

  return {
    sets,
    skippedContactSheets,
    skippedTextFiles,
    skippedEmptyFolders,
  };
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return {
    buf,
    hash: crypto.createHash("sha256").update(buf).digest("hex"),
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const org = await prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { id: true, name: true },
    });
    if (!org) {
      throw new Error(`Organization ${ORG_ID} not found`);
    }

    const { sets, skippedContactSheets, skippedTextFiles, skippedEmptyFolders } =
      walkContentFolders(CONTENT_ROOT);

    let manifest = { version: 1, entries: {} };
    if (fs.existsSync(MANIFEST_PATH)) {
      try {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
      } catch {
        manifest = { version: 1, entries: {} };
      }
    }

    const existingMedia = await prisma.media.findMany({
      where: { organizationId: ORG_ID, deletedAt: null },
      select: { id: true, path: true, collectionId: true, originalName: true },
    });
    const existingByPath = new Set(existingMedia.map((m) => m.path));
    const existingByColName = new Set(
      existingMedia.map((m) => `${m.collectionId || ""}|${m.originalName || ""}`),
    );

    let createdCollections = 0;
    let createdMedia = 0;
    let skippedDuplicates = 0;

    for (const set of sets) {
      let col = await prisma.mediaCollection.findUnique({
        where: {
          organizationId_name: {
            organizationId: ORG_ID,
            name: set.collectionName,
          },
        },
      });
      if (!col) {
        col = await prisma.mediaCollection.create({
          data: {
            organizationId: ORG_ID,
            name: set.collectionName,
          },
        });
        createdCollections += 1;
      }

      const slug = toSlug(set.collectionName);
      const destDir = path.join(UPLOAD_ROOT, "image", "anextvid", slug);
      fs.mkdirSync(destDir, { recursive: true });

      for (const srcPath of set.files) {
        const relSource = path.relative(CONTENT_ROOT, srcPath);
        const filename = path.basename(srcPath);
        const ext = path.extname(filename).toLowerCase() || ".png";
        const { buf, hash } = sha256File(srcPath);
        const manifestKey = `${ORG_ID}::${relSource}`;
        const destName = `${hash.slice(0, 32)}${ext}`;
        const destFile = path.join(destDir, destName);
        const publicUrl = `http://localhost:3000/uploads/image/anextvid/${slug}/${destName}`;

        const alreadyInManifest =
          manifest.entries[manifestKey]?.sha256 === hash &&
          existingByPath.has(publicUrl);
        const alreadyInDb =
          existingByPath.has(publicUrl) ||
          existingByColName.has(`${col.id}|${filename}`);

        if (alreadyInManifest || alreadyInDb) {
          skippedDuplicates += 1;
          continue;
        }

        if (!fs.existsSync(destFile)) {
          fs.writeFileSync(destFile, buf);
        }

        await prisma.media.create({
          data: {
            organizationId: ORG_ID,
            collectionId: col.id,
            name: filename,
            originalName: filename,
            path: publicUrl,
            fileSize: buf.length,
            type: "image",
          },
        });

        existingByPath.add(publicUrl);
        existingByColName.add(`${col.id}|${filename}`);
        manifest.entries[manifestKey] = {
          sha256: hash,
          collectionId: col.id,
          collectionName: set.collectionName,
          publicUrl,
        };
        createdMedia += 1;
      }
    }

    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    console.log(
      JSON.stringify(
        {
          organization: org.name,
          totalSetsScanned: sets.length,
          createdCollections,
          createdMedia,
          skippedDuplicates,
          skippedContactSheets,
          skippedTextFiles,
          skippedEmptyFolders,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
