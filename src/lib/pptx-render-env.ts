import path from "path";

export function getPptxRenderEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FONTCONFIG_FILE: path.join(process.cwd(), "src", "lib", "pptx-fontconfig.conf"),
    HOME: "/tmp",
  };
}
