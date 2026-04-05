package config

import config.WorkspaceUrlValidator.DnsResolver
import zio.test.*

import java.net.InetAddress

object WorkspaceUrlValidatorSpec extends ZIOSpecDefault {

  private val dnsPublicOnly: DnsResolver = new DnsResolver {
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("8.8.8.8")))
  }

  private val dnsLoopback: DnsResolver = new DnsResolver {
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("127.0.0.1")))
  }

  override def spec: Spec[TestEnvironment, Any] =
    suite("WorkspaceUrlValidator")(
      test("accepts https databricks.com host when DNS resolves to public IP") {
        val res = WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com", dnsPublicOnly)
        assert(res)(Assertion.isRight)
      },
      test("rejects localhost") {
        val res = WorkspaceUrlValidator.validate("https://localhost", dnsPublicOnly)
        assert(res)(Assertion.isLeft)
      },
      test("rejects non-https") {
        val res = WorkspaceUrlValidator.validate("http://dbc-12345.cloud.databricks.com", dnsPublicOnly)
        assert(res)(Assertion.isLeft)
      },
      test("rejects host that resolves to loopback") {
        val res = WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com", dnsLoopback)
        assert(res)(Assertion.isLeft)
      }
    )
}
