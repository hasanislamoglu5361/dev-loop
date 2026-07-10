import path from 'node:path';

export interface ResolveProjectPathOptions {
  allowAbsolute?: boolean;
}

export interface ResolvedProjectPath {
  projectRoot: string;
  absolutePath: string;
  relativePath: string;
}

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSafetyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Resolve a requested path and prove it remains inside the project root. */
export function resolveProjectPath(
  projectRoot: string,
  requestedPath: string,
  options: ResolveProjectPathOptions = {},
): ResolvedProjectPath {
  if (!requestedPath.trim()) {
    throw new PathSafetyError('Project path must not be empty.');
  }

  const root = path.resolve(projectRoot);
  const normalizedInput = normalizeInputPath(requestedPath);
  const isAbsoluteInput = path.isAbsolute(normalizedInput) || path.win32.isAbsolute(requestedPath);

  if (isAbsoluteInput && !options.allowAbsolute) {
    throw new PathSafetyError(`Absolute paths are not allowed: ${requestedPath}`);
  }

  if (path.win32.isAbsolute(requestedPath) && !path.isAbsolute(normalizedInput)) {
    throw new PathSafetyError(`Windows absolute paths cannot be resolved on this platform: ${requestedPath}`);
  }

  const absolutePath = isAbsoluteInput
    ? path.resolve(normalizedInput)
    : path.resolve(root, normalizedInput);

  if (!isPathInside(root, absolutePath)) {
    throw new PathSafetyError(`Resolved path is outside project root: ${requestedPath}`);
  }

  return {
    projectRoot: root,
    absolutePath,
    relativePath: toPosixRelative(path.relative(root, absolutePath)),
  };
}

/** Return whether an already-resolved candidate path is contained by a project root. */
export function isPathInsideProject(projectRoot: string, candidatePath: string): boolean {
  return isPathInside(path.resolve(projectRoot), path.resolve(candidatePath));
}

function normalizeInputPath(input: string): string {
  return input.replaceAll('\\', '/');
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function toPosixRelative(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}
