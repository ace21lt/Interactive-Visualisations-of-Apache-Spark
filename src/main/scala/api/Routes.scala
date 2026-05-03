package api

import handlers.{HealthHandler, LoginHandler, NotebookHandler}
import zio.*
import zio.http.*
import java.nio.file.{Files, Paths}

// Route definitions only - delegates to handlers
object Routes:

  // Define the public directory path securely
  private val publicDir = "/app/public"
  private val publicPath = Paths.get(publicDir).toAbsolutePath.normalize()

  def apply(): zio.http.Routes[LoginHandler & NotebookHandler & HealthHandler, Response] =
    zio.http.Routes.fromIterable(
      Chunk(
        // Authentication endpoints
        Method.POST / "api" / "login"  -> handler { (req: Request) =>
          ZIO.serviceWithZIO[LoginHandler](_.login(req))
        },
        Method.POST / "api" / "logout" -> handler { (req: Request) =>
          ZIO.serviceWithZIO[LoginHandler](_.logout(req))
        },
        Method.GET / "api" / "me"      -> handler { (req: Request) =>
          ZIO.serviceWithZIO[LoginHandler](_.me(req))
        },

        // Notebook execution
        Method.POST / "trigger" -> handler { (req: Request) =>
          ZIO.serviceWithZIO[NotebookHandler](_.trigger(req))
        },

        // Health check
        Method.GET / "health" -> handler { (req: Request) =>
          ZIO.serviceWithZIO[HealthHandler](_.health(req))
        }
      )
    ) ++ staticRoutes

  private val staticRoutes: zio.http.Routes[Any, Response] =
    zio.http.Routes(
      // Assets FIRST must match before the catch-all. Returns 404 if missing.
      Method.GET / "assets" / trailing -> handler { (path: Path, _: Request) =>
        val requestedPath = publicPath.resolve(s"assets/${path.encode}").normalize()

        // Security Check: Ensure the requested file is actually inside the public directory
        if (!requestedPath.startsWith(publicPath) || !Files.exists(requestedPath)) {
          Response.notFound
        } else {
          Response(body = Body.fromFile(requestedPath.toFile))
        }
      },

      // SPA catch-all LAST serves index.html for all other GET requests
      Method.GET / trailing -> handler { (path: Path, _: Request) =>
        val requestedPath = publicPath.resolve(path.encode).normalize()

        // Serve root files (e.g., favicon.ico) if they explicitly exist
        if (requestedPath.startsWith(publicPath) && Files.exists(requestedPath) && Files.isRegularFile(requestedPath)) {
          Response(body = Body.fromFile(requestedPath.toFile))
        } else {
          // Fallback to React Router's index.html
          Response(body = Body.fromFile(publicPath.resolve("index.html").toFile))
        }
      }
    )