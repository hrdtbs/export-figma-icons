import * as core from "@actions/core";
import * as Figma from "figma-js";
import * as fs from "fs-extra";
import * as path from "path";
import fetch from "node-fetch";

const hasChildren = (
  node: Figma.Node
): node is Figma.Document | Figma.Canvas | Figma.BooleanGroup => {
  return node.hasOwnProperty("children");
};

const isComponent = (node: Figma.Node): node is Figma.Component => {
  return node.type === "COMPONENT";
};

async function run() {
  try {
    const FIGMA_TOKEN = core.getInput("FIGMA_TOKEN");

    const client = Figma.Client({
      personalAccessToken: FIGMA_TOKEN,
    });

    const FIGMA_FILE_URL = core.getInput("FIGMA_FILE_URL");

    const fileId = FIGMA_FILE_URL.match(/file\/([a-z0-9]+)\//i)?.[1];

    if (fileId === undefined) {
      throw new Error("Cannot find FIGMA_FILE_URL key in process!");
    }

    const { data } = await client.file(fileId);

    const ids: Figma.Node["id"][] = [];
    const components: Figma.Component[] = [];

    const check = (node: Figma.Node) => {
      if (isComponent(node)) {
        components.push(node);
        ids.push(node.id);
      } else if (hasChildren(node)) {
        node.children.forEach(check);
      }
    };

    data.document.children.forEach(check);

    if (ids.length === 0) {
      throw Error("No components found!");
    }

    const {
      data: { images },
    } = await client.fileImages(fileId, {
      format: "svg",
      ids,
      scale: 1,
    });

    const OUTPUT_DIR = core.getInput("OUTPUT_DIR");

    const queues = components.map(async (component) => {
      const image = images[component.id];
      const response = await (
        await fetch(image, {
          headers: {
            "Content-Type": "image/svg+xml",
          },
        })
      ).text();
      await fs
        .ensureDir(OUTPUT_DIR)
        .then(() =>
          fs.writeFile(path.join(OUTPUT_DIR, `${component.name}.svg`), response, "utf8")
        );
      return component.name;
    });
    const filenames = await Promise.all(queues)
    core.setOutput("FILENAMES", filenames);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
