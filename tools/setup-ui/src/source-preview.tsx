import { useMemo, useState } from "react";
import { Editor, type EditorOptions } from "@pierre/diffs/edit";
import { EditProvider, File, type FileOptions } from "@pierre/diffs/react";

import type { SetupComponentArtifact } from "@agent-context/dev-tooling/setup-contract";

const fileOptions: FileOptions<undefined> = {
  disableFileHeader: true,
  overflow: "scroll",
  themeType: "system",
};

function createPierreEditor(options: EditorOptions<undefined>): Editor<undefined> {
  return new Editor(options);
}

export function FormattedSource({
  artifact,
  content,
  editable,
  onChange,
}: {
  readonly artifact: SetupComponentArtifact;
  readonly content: string;
  readonly editable: boolean;
  readonly onChange: (content: string) => void;
}) {
  const [file] = useState(() => ({
    name: artifact.sourcePath,
    contents: content,
  }));
  const editorOptions = useMemo<EditorOptions<undefined>>(() => ({
    onChange: (changedFile) => onChange(changedFile.contents),
  }), [onChange]);

  return (
    <EditProvider createEditor={createPierreEditor}>
      <section className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-muted/20 fade-y focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring" aria-label={`Source for ${artifact.sourcePath}`}>
        <File
          key={artifact.sourcePath}
          className="w-full min-w-0 text-xs"
          edit={editable}
          editorOptions={editorOptions}
          file={file}
          options={fileOptions}
        />
      </section>
    </EditProvider>
  );
}
