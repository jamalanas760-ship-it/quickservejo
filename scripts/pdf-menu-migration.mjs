import fs from "node:fs";

const route = "src/routes/r/$slug.tsx";
let source = fs.readFileSync(route, "utf8");

if (!source.includes('from "@/components/menu/PublicPdfMenu"')) {
  source = source.replace(
    'import { DecorBand,',
    'import { PublicPdfMenu } from "@/components/menu/PublicPdfMenu";\nimport { DecorBand,',
  );
}

const anchor = "        </header>\n\n        {/* Sticky filter rail";
if (!source.includes("<PublicPdfMenu slug={slug} />")) {
  source = source.replace(
    anchor,
    "        </header>\n\n        <PublicPdfMenu slug={slug} />\n\n        {/* Sticky filter rail",
  );
}

fs.writeFileSync(route, source);
console.log("PDF menu customer integration applied");
