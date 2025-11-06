import Vapor

struct APIResponse<T: Content>: Content {
    let code: Int
    let data: T?
    let message: String?

    init(code: Int = 200, data: T? = nil, message: String? = nil) {
        self.code = code
        self.data = data
        self.message = message
    }

    static func success(_ data: T, code: Int = 200, message: String = "Success") -> APIResponse {
        APIResponse(code: code, data: data, message: message)
    }

    static func failure(code: Int, message: String) -> APIResponse {
        APIResponse(code: code, data: nil, message: message)
    }
}
