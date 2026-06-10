import React from 'react';
import PhotoSessionGenerator from './PhotoSessionGenerator';

interface MergedAppWorkspaceProps {
  initialPrompt?: string;
}

export default function MergedAppWorkspace({ initialPrompt }: MergedAppWorkspaceProps) {
  return <PhotoSessionGenerator initialPrompt={initialPrompt} />;
}
