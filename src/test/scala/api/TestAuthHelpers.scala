package api

import zio.NonEmptyChunk
import zio.http.*

object TestAuthHelpers:
  def jsonBody(body: String): Body = Body.fromString(body)

  def extractSidCookie(resp: Response): Option[String] =
    resp.header(Header.SetCookie).flatMap { h =>
      h.renderedValue.split(';').headOption.flatMap { kv =>
        kv.split('=') match
          case Array(name, value) if name.trim == "sid" => Some(value.trim)
          case _                                        => None
      }
    }

  def cookieHeader(sid: String): Header.Cookie =
    Header.Cookie(NonEmptyChunk(Cookie.Request("sid", sid)))

  def loginRequest(workspaceUrl: String, token: String): Request =
    Request
      .post(URL(Path("/api/login")), jsonBody(s"""{"workspaceUrl":"$workspaceUrl","token":"$token"}"""))
      .addHeader(Header.ContentType(MediaType.application.json))
