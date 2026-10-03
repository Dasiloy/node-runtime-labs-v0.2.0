export class ProtocolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

export class BadMagicError extends ProtocolError {
  constructor(details = {}) {
    super("BAD_MAGIC", "Frame magic bytes do not match protocol magic", details);
  }
}

export class UnsupportedVersionError extends ProtocolError {
  constructor(details = {}) {
    super("UNSUPPORTED_VERSION", "Frame version is unsupported", details);
  }
}

export class InvalidLengthError extends ProtocolError {
  constructor(details = {}) {
    super("INVALID_LENGTH", "Frame length is invalid", details);
  }
}

export class UnknownFrameTypeError extends ProtocolError {
  constructor(details = {}) {
    super("UNKNOWN_FRAME_TYPE", "Frame type is unknown", details);
  }
}

export class ChecksumMismatchError extends ProtocolError {
  constructor(details = {}) {
    super("CHECKSUM_MISMATCH", "Frame checksum does not match frame bytes", details);
  }
}

export class InvalidPayloadError extends ProtocolError {
  constructor(details = {}) {
    super("INVALID_PAYLOAD", "Frame payload is invalid", details);
  }
}
