# Thanks to http://code.activestate.com/recipes/577821-integer-square-root-function/ for isqrt()
def isqrt(x):
     if x < 0:
         raise ValueError('square root not defined for negative numbers')
     n = int(x)
     if n == 0:
         return 0
     a, b = divmod(n.bit_length(), 2)
     x = 2**(a+b)
     while True:
         y = (x + n//x)//2
         if y >= x:
             return x
         x = y

x = 0x5472757374206973205269736b00000000000000000000000000000000000000
# 54:72:75:73:74:20:69:73:20:52:69:73:6b is the ASCII representation of "Trust is Risk"
p = 2**256 - 2**32 - 977
y = pow((x**3 + 7), (p+1)//4, p)

while ((y**2) % p) != (x**3 + 7) % p:
  x=x+1
  y = pow((x**3 + 7), (p+1)//4, p)

print("Found it!")
print("x is " + hex(x))
print("y is " + hex(y))
