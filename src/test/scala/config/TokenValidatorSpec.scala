package config

import zio.test.*
import zio.test.Assertion.*

object TokenValidatorSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("TokenValidator")(
      // Valid tokens
      test("accepts valid Databricks PAT token") {
        val token  = "dapiTESTTOKEN-1234567890"
        val result = TokenValidator.validate(token)
        assert(result)(isRight)
      },
      test("accepts token with numbers") {
        val token  = "dapi1234567890123456"
        val result = TokenValidator.validate(token)
        assert(result)(isRight)
      },
      test("accepts token with hyphen") {
        val token  = "dapi-TEST-TOKEN-1234567890"
        val result = TokenValidator.validate(token)
        assert(result)(isRight)
      },
      test("trims whitespace from token") {
        val token  = "  dapiTESTTOKEN-1234567890  "
        val result = TokenValidator.validate(token)
        assert(result)(isRight) &&
        assert(result.map(_.trim()))(equalTo(Right("dapiTESTTOKEN-1234567890")))
      },
      test("accepts token at minimum length (10 chars)") {
        val token  = "dapiTOKEN1" // exactly 10 chars
        val result = TokenValidator.validate(token)
        assert(result)(isRight)
      },

      // Invalid tokens
      test("rejects token without 'dapi' prefix") {
        val token  = "invalidTOKEN-1234567890"
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects token below minimum length") {
        val token  = "dapiTOKEN" // 9 chars, below minimum 10
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects token with special characters") {
        val token  = "dapi@TOKEN-1234567890"
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects token with spaces") {
        val token  = "dapi TOKEN-1234567890"
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects empty token") {
        val token  = ""
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects token with only whitespace") {
        val token  = "   "
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects null token") {
        val token: String = null
        val result        = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("rejects uppercase 'DAPI' prefix") {
        val token  = "DAPITESTTOKENwithcorrectlength"
        val result = TokenValidator.validate(token)
        assert(result)(isLeft)
      },
      test("returns error message on invalid token") {
        val token  = "invalid"
        val result = TokenValidator.validate(token)
        assert(result)(isLeft(anything))
      }
    )
