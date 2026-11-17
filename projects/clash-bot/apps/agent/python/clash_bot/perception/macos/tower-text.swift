// Local macOS 14+ experiment. Build outside Git with swiftc -O -target arm64-apple-macosx14.0.
// Vision runs on the CPU; only the reviewed own-tower HP label band is examined.
import Foundation
import Vision
import CoreML
import ImageIO
import CoreGraphics

struct Input: Decodable { let op: String; let image: String }
enum ReadError: Error { case invalidInput, invalidImage, noCpuDevice }
func emit(_ value: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]
for (stage, devices) in try request.supportedComputeStageDevices {
    guard let cpu = devices.first(where: { if case .cpu = $0 { return true }; return false }) else { throw ReadError.noCpuDevice }
    request.setComputeDevice(cpu, for: stage)
}

func readHp(_ path: String) throws -> [[String: Any]] {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil), image.width == 368, image.height == 652,
          let crop = image.cropping(to: CGRect(x: 35, y: 393, width: 300, height: 100)),
          let context = CGContext(data: nil, width: 1200, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { throw ReadError.invalidImage }
    context.interpolationQuality = .high
    context.draw(crop, in: CGRect(x: 0, y: 0, width: 1200, height: 400))
    guard let scaled = context.makeImage() else { throw ReadError.invalidImage }
    try VNImageRequestHandler(cgImage: scaled).perform([request])
    return ["left", "right"].map { tower in
        let candidates = (request.results ?? []).compactMap { observation -> (Int, Float)? in
            guard let text = observation.topCandidates(1).first,
                  text.string.range(of: "^[0-9]{1,5}$", options: .regularExpression) != nil,
                  let hp = Int(text.string), hp > 0, hp <= 20000 else { return nil }
            let x = 35 + observation.boundingBox.midX * 300
            let y = 393 + (1 - observation.boundingBox.midY) * 100
            let inLane = tower == "left" ? (72...115).contains(x) : (263...309).contains(x)
            guard inLane, (405...425).contains(y) else { return nil }
            return (hp, text.confidence)
        }
        guard candidates.count == 1, let candidate = candidates.first else {
            return ["tower": tower, "hp": NSNull(), "confidence": 0]
        }
        return ["tower": tower, "hp": candidate.0, "confidence": candidate.1]
    }
}

guard CommandLine.arguments.dropFirst() == ["serve"] else { throw ReadError.invalidInput }
try emit(["type": "ready", "format": "macos-tower-text-v1", "readOnly": true])
while let line = readLine() {
    let started = ProcessInfo.processInfo.systemUptime
    do {
        let data = Data(line.utf8)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(object.keys) == ["op", "image"] else { throw ReadError.invalidInput }
        let input = try JSONDecoder().decode(Input.self, from: data)
        guard input.op == "read", !input.image.isEmpty else { throw ReadError.invalidInput }
        let readings = try autoreleasepool { try readHp(input.image) }
        try emit(["type": "result", "format": "macos-tower-text-v1", "readings": readings,
                  "elapsed_ms": Int((ProcessInfo.processInfo.systemUptime - started) * 1000)])
    } catch {
        try emit(["type": "error", "message": String(describing: error)])
    }
}
