package config

import config.WorkspaceUrlValidator.DnsResolver
import zio.test.*
import zio.test.Assertion.*

import java.net.InetAddress

object WorkspaceUrlValidatorSpec extends ZIOSpecDefault {

  private val dnsPublicOnly: DnsResolver = new DnsResolver {
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("8.8.8.8")))
  }

  private val dnsLoopback: DnsResolver = new DnsResolver {
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("127.0.0.1")))
  }

  private val dnsCgnat: DnsResolver = new DnsResolver {
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("100.64.0.1")))
  }

  private val dnsIpv6Ula: DnsResolver = new DnsResolver {
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("fc00::1")))
  }

  override def spec: Spec[TestEnvironment, Any] =
    suite("WorkspaceUrlValidator")(
      test("accepts https databricks.com host when DNS resolves to public IP") {
        val res = WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com", dnsPublicOnly)
        assert(res)(isRight)
      },
      test("trims whitespace and strips a trailing slash") {
        val res = WorkspaceUrlValidator.validate("  https://dbc-12345.cloud.databricks.com/  ", dnsPublicOnly)
        assert(res)(isRight(equalTo("https://dbc-12345.cloud.databricks.com")))
      },
      test("strips everything after the .com") {
        val res =
          WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com/?o=306654497558756", dnsPublicOnly)
        assert(res)(isRight(equalTo("https://dbc-12345.cloud.databricks.com")))
      },
      test("rejects empty input") {
        val res = WorkspaceUrlValidator.validate("", dnsPublicOnly)
        assert(res)(isLeft)
      },
      test("rejects invalid URI text") {
        val res = WorkspaceUrlValidator.validate("https://%", dnsPublicOnly)
        assert(res)(isLeft)
      },
      test("rejects missing host") {
        val res = WorkspaceUrlValidator.validate("https:///path", dnsPublicOnly)
        assert(res)(isLeft)
      },
      test("rejects localhost") {
        val res = WorkspaceUrlValidator.validate("https://localhost", dnsPublicOnly)
        assert(res)(isLeft)
      },
      test("rejects non-https") {
        val res = WorkspaceUrlValidator.validate("http://dbc-12345.cloud.databricks.com", dnsPublicOnly)
        assert(res)(isLeft)
      },
      test("rejects host that resolves to loopback") {
        val res = WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com", dnsLoopback)
        assert(res)(isLeft)
      },
      test("rejects host that resolves to CGNAT space") {
        val res = WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com", dnsCgnat)
        assert(res)(isLeft)
      },
      test("rejects host that resolves to IPv6 ULA") {
        val res = WorkspaceUrlValidator.validate("https://dbc-12345.cloud.databricks.com", dnsIpv6Ula)
        assert(res)(isLeft)
      }
    )
}
