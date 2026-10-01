import ExpoModulesCore
import Foundation
import CryptoKit

public class ZhihuPersistenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZhihuPersistence")
    AsyncFunction("writeAtomically") { (uri: String, value: String) in
      guard let url = URL(string: uri), url.isFileURL,
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
        throw NSError(domain: "ZhihuPersistence", code: 1)
      }
      let path = url.standardizedFileURL.resolvingSymlinksInPath().path
      let root = documents.standardizedFileURL.resolvingSymlinksInPath().path + "/"
      guard path.hasPrefix(root), !url.hasDirectoryPath else {
        throw NSError(domain: "ZhihuPersistence", code: 1)
      }
      do {
        let bytes = Data(value.utf8)
        guard bytes.count <= 16_777_216 else { throw NSError(domain: "ZhihuPersistence", code: 2) }
        try bytes.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      } catch {
        // Never attach the original exception, path or data to bridge errors.
        throw NSError(domain: "ZhihuPersistence", code: 2)
      }
    }
    AsyncFunction("readAtomically") { (uri: String) -> String? in
      guard let url = URL(string: uri), url.isFileURL,
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
            url.standardizedFileURL.resolvingSymlinksInPath().path.hasPrefix(documents.standardizedFileURL.resolvingSymlinksInPath().path + "/") else {
        throw NSError(domain: "ZhihuPersistence", code: 4)
      }
      do {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let size = attributes[.size] as? NSNumber, size.int64Value <= 16_777_216 else { throw NSError(domain: "ZhihuPersistence", code: 4) }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var data = Data()
        while let bytes = try handle.read(upToCount: 65_536), !bytes.isEmpty {
          guard data.count + bytes.count <= 16_777_216 else { throw NSError(domain: "ZhihuPersistence", code: 4) }
          data.append(bytes)
        }
        guard let value = String(data: data, encoding: .utf8) else { throw NSError(domain: "ZhihuPersistence", code: 4) }
        return value
      } catch let error as NSError {
        if error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError { return nil }
        throw NSError(domain: "ZhihuPersistence", code: 4)
      }
    }
    AsyncFunction("inspectApk") { (uri: String) -> [String: Any] in
      do {
        guard let url = URL(string: uri), url.isFileURL else { throw NSError(domain: "ZhihuPersistence", code: 3) }
        let path = url.standardizedFileURL.resolvingSymlinksInPath().path
        let roots = [FileManager.SearchPathDirectory.documentDirectory, .cachesDirectory].compactMap {
          FileManager.default.urls(for: $0, in: .userDomainMask).first?.standardizedFileURL.resolvingSymlinksInPath().path
        }
        guard roots.contains(where: { path.hasPrefix($0 + "/") }) else { throw NSError(domain: "ZhihuPersistence", code: 3) }
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
              let size = attributes[.size] as? NSNumber, size.int64Value <= 1_073_741_824 else { throw NSError(domain: "ZhihuPersistence", code: 3) }
        let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
        defer { try? handle.close() }
        var hash = SHA256()
        var total = 0
        var magic = Data()
        while let bytes = try handle.read(upToCount: 1_048_576), !bytes.isEmpty {
          total += bytes.count
          guard total <= 1_073_741_824 else { throw NSError(domain: "ZhihuPersistence", code: 3) }
          if magic.isEmpty { magic = bytes.prefix(4) }
          hash.update(data: bytes)
        }
        guard total == size.intValue else { throw NSError(domain: "ZhihuPersistence", code: 3) }
        return ["size": total, "sha256": hash.finalize().map { String(format: "%02x", $0) }.joined(), "isZip": magic == Data([0x50, 0x4b, 0x03, 0x04])]
      } catch {
        throw NSError(domain: "ZhihuPersistence", code: 3)
      }
    }

  }
}
