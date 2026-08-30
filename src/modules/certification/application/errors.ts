export class CertificationApplicationError extends Error {
  constructor(
    readonly code: "CONTEXT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "CertificationApplicationError";
  }
}
