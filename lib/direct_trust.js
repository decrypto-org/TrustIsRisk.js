//      
                                                   
var bcoin = require('bcoin');
var assert = require('assert');
var helpers = require('./helpers');

                           
                
              
                  

                  
                        
                         

                      
                    
 

class DirectTrust {
               
             
                 

  // Every DT is associated with a transaction output, except for non-standard trust decreasing
  // transactions, which reduce trust to zero and are related to a whole transaction and not
  // a specific output.
                 
                               
                                

                             
                              

  constructor(options                     ) {
    this.outputIndex = null;
    this.script = null;
    this.prev = null;
    this.next = null;
    Object.assign(this, options);
  }

  isNull() {
    return this.amount === 0;
  }

  isIncrease()           {
    return this.prev === null;
  }

  isDecrease()           {
    return !this.isIncrease();
  }

  isSpent()           {
    return this.next !== null;
  }

  isSpendable()           {
    return !this.isSpent() && !this.isNull();
  }

  isValid()           {
    // TODO: Consider removing this function and ensure validity at build time by using the flow
    //       type system, possibly by creating sub-types like "IncreasingDirectTrust" etc.
    var valid = true;

    if ((this.outputIndex === null) !== (this.script === null)) valid = false;
    if (this.outputIndex === null && this.isIncrease()) valid = false;
    if (this.outputIndex === null && this.amount > 0) valid = false;
    if (this.isIncrease() && this.isNull()) valid = false;
    if (this.isSpent() && this.isNull()) valid = false;

    return valid;
  }

  getFromEntity()          {
    return helpers.pubKeyToEntity(this.from);
  }

  getToEntity()          {
    return helpers.pubKeyToEntity(this.to);
  }

  spend(next              )        {
    assert(!this.isSpent());
    assert(this.from.equals(next.from) && this.to.equals(next.to));
    assert(next.amount <= this.amount);

    this.next = next;
    next.prev = this;
  }

  getNullifying(txHash         )               {
    return new DirectTrust({
      from: this.from,
      to: this.to,
      amount: 0,

      prev: this,
      txHash,
    });
  }
}

module.exports = DirectTrust;
